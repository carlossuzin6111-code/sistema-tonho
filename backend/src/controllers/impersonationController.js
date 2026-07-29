const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');
const { recordAudit } = require('../services/auditService');

const SUPPORT_ROLES = new Set(['support', 'admin']);
function supportOnly(req, res) {
  if (!SUPPORT_ROLES.has(req.user.role) || req.user.isImpersonation) { res.status(403).json({ error: 'Support or admin role required' }); return false; }
  return true;
}

async function create(req, res) {
  if (!supportOnly(req, res)) return;
  const targetUserId = Number(req.body.targetUserId);
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!Number.isInteger(targetUserId) || targetUserId < 1 || !reason || reason.length > 500) return res.status(400).json({ error: 'targetUserId and reason are required' });
  if (targetUserId === req.user.id) return res.status(400).json({ error: 'Cannot impersonate yourself' });
  const target = await db('users').where({ id: targetUserId }).select('id', 'role', 'session_version').first();
  if (!target) return res.status(404).json({ error: 'Target user not found' });
  const id = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
  await db.transaction(async trx => {
    await trx('impersonation_events').insert({ id, actor_user_id: req.user.id, target_user_id: target.id, reason, expires_at: expiresAt.toISOString() });
    await recordAudit(trx, { actorUserId: req.user.id, action: 'support.impersonation_started', targetType: 'user', targetId: target.id, metadata: { impersonationId: id, reason, expiresAt: expiresAt.toISOString() } });
  });
  const token = jwt.sign({ id: target.id, role: target.role, sessionVersion: target.session_version || 0, impersonatedBy: req.user.id, impersonationId: id }, JWT_SECRET, { expiresIn: '15m' });
  return res.status(201).json({ impersonationId: id, token, expiresAt: expiresAt.toISOString(), targetUserId: target.id });
}

async function list(req, res) {
  if (!supportOnly(req, res)) return;
  const rows = await db('impersonation_events as ie').join('users as u', 'u.id', 'ie.target_user_id').where('ie.actor_user_id', req.user.id).select('ie.id', 'ie.target_user_id as targetUserId', 'u.name as targetName', 'ie.reason', 'ie.expires_at as expiresAt', 'ie.revoked_at as revokedAt', 'ie.created_at as createdAt').orderBy('ie.created_at', 'desc').limit(100);
  return res.json(rows);
}

async function revoke(req, res) {
  if (!supportOnly(req, res)) return;
  const updated = await db('impersonation_events').where({ id: req.params.id, actor_user_id: req.user.id }).whereNull('revoked_at').update({ revoked_at: db.fn.now(), updated_at: db.fn.now() });
  if (!updated) return res.status(404).json({ error: 'Active impersonation event not found' });
  await recordAudit(db, { actorUserId: req.user.id, action: 'support.impersonation_revoked', targetType: 'impersonation_event', targetId: req.params.id });
  return res.json({ message: 'Impersonation revoked' });
}

module.exports = { create, list, revoke, SUPPORT_ROLES };
