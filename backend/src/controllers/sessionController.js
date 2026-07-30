const db = require('../database');

async function listSessions(req, res) {
  const rows = await db('user_sessions').where({ user_id: req.user.id, status: 'active' }).select('id', 'device_name as deviceName', 'user_agent as userAgent', 'ip_address as ipAddress', 'last_seen_at as lastSeenAt', 'created_at as createdAt').orderBy('last_seen_at', 'desc');
  return res.json(rows.map(row => ({ ...row, current: row.id === req.user.sessionId })));
}

async function revokeSession(req, res) {
  const sessionId = String(req.params.id);
  if (sessionId === req.user.sessionId) return res.status(400).json({ error: 'Current session cannot be revoked from itself' });
  const updated = await db('user_sessions').where({ id: sessionId, user_id: req.user.id, status: 'active' }).update({ status: 'revoked', revoked_at: db.fn.now(), updated_at: db.fn.now() });
  return updated ? res.json({ message: 'Session revoked' }) : res.status(404).json({ error: 'Active session not found' });
}

module.exports = { listSessions, revokeSession };
