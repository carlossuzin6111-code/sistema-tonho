const db = require('../database');
const { pruneUserSessions } = require('../services/sessionService');
const { revokeRefreshTokensForSessions } = require('../services/refreshTokenService');
const metricsService = require('../services/metricsService');

function maskIpAddress(value) {
  if (!value) return null;
  const normalized = String(value).replace(/^::ffff:/, '');
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(normalized)) return normalized.replace(/\.\d+$/, '.0/24');
  if (normalized.includes(':')) return `${normalized.split(':').slice(0, 4).join(':')}::/64`;
  return null;
}

async function listSessions(req, res) {
  await pruneUserSessions(req.user.id, db);
  const rows = await db('user_sessions').where({ user_id: req.user.id, status: 'active' }).select('id', 'device_name as deviceName', 'ip_address as ipAddress', 'last_seen_at as lastSeenAt', 'created_at as createdAt').orderBy('last_seen_at', 'desc');
  return res.json(rows.map(row => ({ ...row, ipAddress: maskIpAddress(row.ipAddress), current: row.id === req.user.sessionId })));
}

async function revokeSession(req, res) {
  const sessionId = String(req.params.id);
  if (sessionId === req.user.sessionId) return res.status(400).json({ error: 'Current session cannot be revoked from itself' });
  const updated = await db.transaction(async trx => {
    const count = await trx('user_sessions').where({ id: sessionId, user_id: req.user.id, status: 'active' }).update({ status: 'revoked', revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
    if (count) await revokeRefreshTokensForSessions(req.user.id, [sessionId], trx);
    return count;
  });
  if (updated) metricsService.increment('device_sessions_total', { action: 'remotely_revoked' });
  return updated ? res.json({ message: 'Session revoked' }) : res.status(404).json({ error: 'Active session not found' });
}

async function revokeOtherSessions(req, res) {
  if (!req.user.sessionId) return res.status(400).json({ error: 'Current device session is not identifiable' });
  const query = db('user_sessions').where({ user_id: req.user.id, status: 'active' });
  if (req.user.sessionId) query.whereNot({ id: req.user.sessionId });
  const ids = await query.pluck('id');
  await db.transaction(async trx => {
    if (ids.length) {
      await trx('user_sessions').whereIn('id', ids).update({ status: 'revoked', revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
      await revokeRefreshTokensForSessions(req.user.id, ids, trx);
    }
  });
  metricsService.add('device_sessions_total', ids.length, { action: 'other_sessions_revoked' });
  return res.json({ message: 'Other sessions revoked', revoked: ids.length });
}

module.exports = { listSessions, maskIpAddress, revokeOtherSessions, revokeSession };
