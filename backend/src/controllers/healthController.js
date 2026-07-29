const db = require('../database');

async function live(_req, res) {
  // Liveness must not depend on the database: supervisors use this endpoint
  // to decide whether the process should be restarted.
  return res.json({ status: 'ok' });
}

async function ready(_req, res) {
  try {
    await db.ready;
    await db.raw('SELECT 1');
    const [, pendingMigrations] = await db.migrate.list();
    if (pendingMigrations.length > 0) return res.status(503).json({ status: 'unavailable' });
    return res.json({ status: 'ok' });
  } catch (error) {
    console.error('Readiness check failed:', error.message);
    return res.status(503).json({ status: 'unavailable' });
  }
}

module.exports = { live, ready };
