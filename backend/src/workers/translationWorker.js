const TRANSLATION_PENDING = 0;
const TRANSLATION_COMPLETE = 1;
const TRANSLATION_CLAIMED = 2;

const DEFAULT_POLL_INTERVAL_MS = 15000;
const DEFAULT_WORK_INTERVAL_MS = 800;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEFAULT_CLAIM_TIMEOUT_MS = 5 * 60 * 1000;

function abortableDelay(delayMs, signal) {
  if (signal?.aborted || delayMs <= 0) {
    return Promise.resolve();
  }

  return new Promise(resolve => {
    const timeout = setTimeout(finish, delayMs);

    function finish() {
      clearTimeout(timeout);
      signal?.removeEventListener('abort', finish);
      resolve();
    }

    signal?.addEventListener('abort', finish, { once: true });
  });
}

function pendingExercise() {
  this.where('is_translated', false).orWhereNull('is_translated');
}

async function recoverStaleClaims(db, { claimTimeoutMs = DEFAULT_CLAIM_TIMEOUT_MS, now = Date.now } = {}) {
  const staleBefore = new Date(now() - claimTimeoutMs)
    .toISOString()
    .replace('T', ' ')
    .replace('Z', '');

  return db('exercises')
    .where('is_translated', TRANSLATION_CLAIMED)
    .andWhere('updated_at', '<', staleBefore)
    .update({
      is_translated: TRANSLATION_PENDING,
      updated_at: db.fn.now()
    });
}

async function claimNextExercise(db, options = {}) {
  await recoverStaleClaims(db, options);

  while (true) {
    const exercise = await db('exercises')
      .where(pendingExercise)
      .orderBy('id', 'asc')
      .first();

    if (!exercise) {
      return null;
    }

    const claimed = await db('exercises')
      .where({ id: exercise.id })
      .andWhere(pendingExercise)
      .update({
        is_translated: TRANSLATION_CLAIMED,
        updated_at: db.fn.now()
      });

    if (claimed === 1) {
      return exercise;
    }
  }
}

async function requestTranslation(text, { fetchImpl = global.fetch, signal } = {}) {
  if (!text) {
    return '';
  }

  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  const response = await fetchImpl(url, { signal });

  if (!response.ok) {
    const error = new Error(`Translation provider returned HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const json = await response.json();
  return json[0].map(part => part[0]).join('').trim();
}

async function translateExercise(exercise, options = {}) {
  const combined = await requestTranslation(
    `${exercise.name} ||| ${exercise.description || ''}`,
    options
  );
  const parts = combined.split('|||').map(part => part.trim());

  if (parts.length === 2 && parts[0] && parts[1]) {
    return { name: parts[0], description: parts[1] };
  }

  const name = await requestTranslation(exercise.name, options);
  const description = await requestTranslation(exercise.description, options);
  return {
    name: name || exercise.name,
    description: description || exercise.description
  };
}

async function releaseClaim(db, exerciseId) {
  await db('exercises')
    .where({ id: exerciseId, is_translated: TRANSLATION_CLAIMED })
    .update({
      is_translated: TRANSLATION_PENDING,
      updated_at: db.fn.now()
    });
}

async function processNextExercise(db, options = {}) {
  const exercise = await claimNextExercise(db, options);
  if (!exercise) {
    return { status: 'idle' };
  }

  try {
    const translated = await translateExercise(exercise, options);
    const updated = await db('exercises')
      .where({ id: exercise.id, is_translated: TRANSLATION_CLAIMED })
      .update({
        ...translated,
        is_translated: TRANSLATION_COMPLETE,
        updated_at: db.fn.now()
      });

    return updated === 1
      ? { status: 'translated', exerciseId: exercise.id }
      : { status: 'claim_lost', exerciseId: exercise.id };
  } catch (error) {
    await releaseClaim(db, exercise.id);
    return {
      status: options.signal?.aborted ? 'aborted' : 'failed',
      exerciseId: exercise.id,
      error
    };
  }
}

async function runTranslationWorker(db, options = {}) {
  const {
    signal,
    logger = console,
    pollIntervalMs = DEFAULT_POLL_INTERVAL_MS,
    workIntervalMs = DEFAULT_WORK_INTERVAL_MS,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS
  } = options;

  while (!signal?.aborted) {
    const result = await processNextExercise(db, options);

    if (result.status === 'aborted') {
      break;
    }
    if (result.status === 'failed') {
      logger.error(`[Translator] Exercise ${result.exerciseId} failed: ${result.error.message}`);
      await abortableDelay(retryDelayMs, signal);
      continue;
    }
    if (result.status === 'idle') {
      await abortableDelay(pollIntervalMs, signal);
      continue;
    }

    await abortableDelay(workIntervalMs, signal);
  }
}

module.exports = {
  DEFAULT_CLAIM_TIMEOUT_MS,
  TRANSLATION_CLAIMED,
  TRANSLATION_COMPLETE,
  TRANSLATION_PENDING,
  abortableDelay,
  claimNextExercise,
  processNextExercise,
  recoverStaleClaims,
  runTranslationWorker,
  translateExercise
};
