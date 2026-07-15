const knex = require('knex');
const config = require('../../knexfile');
const {
  TRANSLATION_CLAIMED,
  TRANSLATION_COMPLETE,
  TRANSLATION_PENDING,
  processNextExercise,
  runTranslationWorker
} = require('../workers/translationWorker');

function translationResponse(text) {
  return {
    ok: true,
    status: 200,
    json: async () => [[[text]]]
  };
}

describe('translation worker', () => {
  let db;

  beforeEach(async () => {
    db = knex(config.test);
    await db.schema.createTable('exercises', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.text('description');
      table.integer('is_translated').defaultTo(TRANSLATION_PENDING);
      table.timestamps(true, true);
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('allows only one worker to translate a pending exercise', async () => {
    await db('exercises').insert({
      name: 'Squat',
      description: 'Leg exercise',
      is_translated: TRANSLATION_PENDING
    });
    const fetchImpl = jest.fn(async () => {
      await new Promise(resolve => setTimeout(resolve, 20));
      return translationResponse('Agachamento ||| Exercício de pernas');
    });

    const results = await Promise.all([
      processNextExercise(db, { fetchImpl }),
      processNextExercise(db, { fetchImpl })
    ]);

    expect(results.map(result => result.status).sort()).toEqual(['idle', 'translated']);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(db('exercises').first()).resolves.toMatchObject({
      name: 'Agachamento',
      description: 'Exercício de pernas',
      is_translated: TRANSLATION_COMPLETE
    });
  });

  test('releases a claim when the provider fails', async () => {
    await db('exercises').insert({
      name: 'Bench Press',
      description: 'Chest exercise',
      is_translated: TRANSLATION_PENDING
    });
    const fetchImpl = jest.fn(async () => ({ ok: false, status: 503 }));

    const result = await processNextExercise(db, { fetchImpl });

    expect(result.status).toBe('failed');
    expect(result.error.message).toContain('HTTP 503');
    await expect(db('exercises').first()).resolves.toMatchObject({
      name: 'Bench Press',
      is_translated: TRANSLATION_PENDING
    });
  });

  test('recovers an expired claim before processing it', async () => {
    await db('exercises').insert({
      name: 'Deadlift',
      description: 'Back exercise',
      is_translated: TRANSLATION_CLAIMED,
      updated_at: '2000-01-01 00:00:00'
    });
    const fetchImpl = jest.fn(async () => translationResponse('Levantamento Terra ||| Exercício de costas'));

    const result = await processNextExercise(db, {
      fetchImpl,
      claimTimeoutMs: 1000
    });

    expect(result.status).toBe('translated');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(db('exercises').first()).resolves.toMatchObject({
      name: 'Levantamento Terra',
      is_translated: TRANSLATION_COMPLETE
    });
  });

  test('aborts an active request, releases its claim and exits', async () => {
    await db('exercises').insert({
      name: 'Row',
      description: 'Back exercise',
      is_translated: TRANSLATION_PENDING
    });
    const controller = new AbortController();
    let notifyFetchStarted;
    const fetchStarted = new Promise(resolve => {
      notifyFetchStarted = resolve;
    });
    const fetchImpl = jest.fn((_url, { signal }) => new Promise((resolve, reject) => {
      notifyFetchStarted();
      signal.addEventListener('abort', () => {
        const error = new Error('Request aborted');
        error.name = 'AbortError';
        reject(error);
      }, { once: true });
    }));

    const worker = runTranslationWorker(db, {
      signal: controller.signal,
      fetchImpl,
      pollIntervalMs: 60000,
      workIntervalMs: 60000,
      retryDelayMs: 60000,
      logger: { error: jest.fn() }
    });

    await fetchStarted;
    controller.abort();
    await worker;

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    await expect(db('exercises').first()).resolves.toMatchObject({
      name: 'Row',
      is_translated: TRANSLATION_PENDING
    });
  });
});
