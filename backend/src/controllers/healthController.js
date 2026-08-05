const db = require('../database');
const metricsService = require('../services/metricsService');

async function live(_req, res) {
  // Liveness must not depend on the database: supervisors use this endpoint
  // to decide whether the process should be restarted.
  metricsService.increment('health_checks_total', { probe: 'live', outcome: 'ok' });
  return res.json({ status: 'ok' });
}

async function ready(_req, res) {
  try {
    await db.ready;
    await db.raw('SELECT 1');
    const [, pendingMigrations] = await db.migrate.list();
    if (pendingMigrations.length > 0) {
      metricsService.increment('health_checks_total', { probe: 'ready', outcome: 'migrations_pending' });
      return res.status(503).json({ status: 'unavailable', reason: 'migrations_pending' });
    }
    metricsService.increment('health_checks_total', { probe: 'ready', outcome: 'ok' });
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    metricsService.increment('health_checks_total', { probe: 'ready', outcome: 'database_unavailable' });
    return res.status(503).json({ status: 'unavailable', reason: 'database_unavailable' });
  }
}

module.exports = { live, ready };
