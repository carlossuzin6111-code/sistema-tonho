const db = require('../database');
const { recordAudit } = require('../services/auditService');

const PROVIDERS = new Set(['apple_healthkit', 'google_health_connect', 'garmin']);
const METRICS = new Set(['sleep', 'hrv']);
const UNITS = new Set(['minutes', 'ms', 'score']);

function parseJson(value, fallback = []) {
  try { return JSON.parse(value || ''); } catch { return fallback; }
}

function validDate(value) {
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) ? date : null;
}

async function assertStudentAccess(req, studentId) {
  if (req.user.role === 'student') return req.user.id === studentId;
  if (req.user.role !== 'personal') return false;
  return Boolean(await db('student_profiles').where({ student_id: studentId, personal_id: req.user.id }).first());
}

async function createConnection(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can connect a wearable' });
  const provider = String(req.body.provider || '');
  if (!PROVIDERS.has(provider)) return res.status(400).json({ error: 'Unsupported wearable provider' });
  const externalAccountId = req.body.externalAccountId ? String(req.body.externalAccountId).slice(0, 160) : null;
  const scopes = Array.isArray(req.body.scopes) ? [...new Set(req.body.scopes.map(String))].slice(0, 20) : [];
  try {
    const existing = await db('wearable_connections').where({ student_id: req.user.id, provider, external_account_id: externalAccountId }).first();
    const payload = { scopes: JSON.stringify(scopes), status: 'pending', updated_at: db.fn.now() };
    let id;
    await db.transaction(async trx => {
      if (existing) {
        await trx('wearable_connections').where({ id: existing.id }).update(payload);
        id = existing.id;
      } else {
        [id] = await trx('wearable_connections').insert({ student_id: req.user.id, provider, external_account_id: externalAccountId, ...payload });
      }
      await recordAudit(trx, { actorUserId: req.user.id, action: 'wearable.connection_requested', targetType: 'wearable_connection', targetId: id, metadata: { provider } });
    });
    return res.status(existing ? 200 : 202).json({ id, provider, status: 'pending', scopes });
  } catch (error) {
    console.error('Create wearable connection error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function revokeConnection(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can revoke a wearable' });
  try {
    const updated = await db('wearable_connections').where({ id: req.params.id, student_id: req.user.id }).update({ status: 'revoked', updated_at: db.fn.now() });
    return updated ? res.json({ message: 'Wearable connection revoked' }) : res.status(404).json({ error: 'Wearable connection not found' });
  } catch (error) {
    console.error('Revoke wearable connection error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function ingestMetrics(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can ingest wearable data' });
  const samples = Array.isArray(req.body.samples) ? req.body.samples : [];
  if (!samples.length || samples.length > 100) return res.status(400).json({ error: 'samples must contain between 1 and 100 items' });
  try {
    const connection = await db('wearable_connections').where({ id: req.params.id, student_id: req.user.id, status: 'active' }).first();
    if (!connection) return res.status(404).json({ error: 'Active wearable connection not found' });
    const rows = samples.map(sample => {
      const metricType = String(sample.metricType || '');
      const unit = String(sample.unit || '');
      const observedAt = validDate(sample.observedAt);
      const value = Number(sample.value);
      if (!METRICS.has(metricType) || !UNITS.has(unit) || !observedAt || !Number.isFinite(value) || value < 0 || !sample.sourceEventId) throw new Error('Invalid wearable sample');
      return { connection_id: connection.id, student_id: req.user.id, metric_type: metricType, observed_at: observedAt.toISOString(), value, unit, source_event_id: String(sample.sourceEventId).slice(0, 180) };
    });
    await db.transaction(async trx => {
      for (const row of rows) {
        const existing = await trx('wearable_metrics').where({ connection_id: row.connection_id, source_event_id: row.source_event_id }).first();
        if (existing) await trx('wearable_metrics').where({ id: existing.id }).update(row);
        else await trx('wearable_metrics').insert(row);
      }
      await trx('wearable_connections').where({ id: connection.id }).update({ last_synced_at: db.fn.now(), updated_at: db.fn.now(), status: 'active' });
      await recordAudit(trx, { actorUserId: req.user.id, action: 'wearable.metrics_ingested', targetType: 'wearable_connection', targetId: connection.id, metadata: { count: rows.length } });
    });
    return res.status(202).json({ accepted: rows.length });
  } catch (error) {
    if (error.message === 'Invalid wearable sample') return res.status(400).json({ error: error.message });
    console.error('Ingest wearable metrics error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listMetrics(req, res) {
  const studentId = Number(req.query.studentId || req.user.id);
  if (!Number.isInteger(studentId) || !(await assertStudentAccess(req, studentId))) return res.status(403).json({ error: 'Student access denied' });
  const metricType = req.query.metricType ? String(req.query.metricType) : null;
  if (metricType && !METRICS.has(metricType)) return res.status(400).json({ error: 'Unsupported metric type' });
  try {
    const query = db('wearable_metrics as wm').join('wearable_connections as wc', 'wc.id', 'wm.connection_id').where({ 'wm.student_id': studentId, 'wc.status': 'active' }).select('wm.id', 'wm.metric_type as metricType', 'wm.observed_at as observedAt', 'wm.value', 'wm.unit', 'wc.provider').orderBy('wm.observed_at', 'desc').limit(200);
    if (metricType) query.andWhere('wm.metric_type', metricType);
    return res.json(await query);
  } catch (error) {
    console.error('List wearable metrics error:', error.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function listConnections(req, res) {
  if (req.user.role !== 'student') return res.status(403).json({ error: 'Only students can list wearable connections' });
  const rows = await db('wearable_connections').where({ student_id: req.user.id }).select('id', 'provider', 'status', 'scopes', 'last_synced_at as lastSyncedAt', 'created_at as createdAt').orderBy('created_at', 'desc');
  return res.json(rows.map(row => ({ ...row, scopes: parseJson(row.scopes) })));
}

module.exports = { createConnection, revokeConnection, ingestMetrics, listMetrics, listConnections };
