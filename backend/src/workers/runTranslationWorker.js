const knex = require('knex');
const config = require('../../knexfile');
const { abortableDelay, runTranslationWorker } = require('./translationWorker');

const env = process.env.NODE_ENV || 'development';
const controller = new AbortController();

function nonNegativeInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function waitForSchema(db) {
  while (!controller.signal.aborted) {
    if (await db.schema.hasTable('exercises')) {
      return true;
    }
    console.log('[Translator] Waiting for the API to initialize the database schema...');
    await abortableDelay(5000, controller.signal);
  }
  return false;
}

function stop(signalName) {
  if (!controller.signal.aborted) {
    console.log(`[Translator] ${signalName} received; stopping gracefully...`);
    controller.abort();
  }
}

async function main() {
  const db = knex(config[env]);
  const onSigint = () => stop('SIGINT');
  const onSigterm = () => stop('SIGTERM');
  process.once('SIGINT', onSigint);
  process.once('SIGTERM', onSigterm);

  try {
    if (!(await waitForSchema(db))) {
      return;
    }

    console.log('[Translator] Worker started.');
    await runTranslationWorker(db, {
      signal: controller.signal,
      pollIntervalMs: nonNegativeInteger(process.env.TRANSLATION_POLL_INTERVAL_MS, 15000),
      workIntervalMs: nonNegativeInteger(process.env.TRANSLATION_WORK_INTERVAL_MS, 800),
      retryDelayMs: nonNegativeInteger(process.env.TRANSLATION_RETRY_DELAY_MS, 5000),
      claimTimeoutMs: positiveInteger(process.env.TRANSLATION_CLAIM_TIMEOUT_MS, 300000)
    });
  } finally {
    process.removeListener('SIGINT', onSigint);
    process.removeListener('SIGTERM', onSigterm);
    await db.destroy();
    console.log('[Translator] Worker stopped.');
  }
}

main().catch(error => {
  console.error('[Translator] Fatal error:', error.message);
  process.exitCode = 1;
});
