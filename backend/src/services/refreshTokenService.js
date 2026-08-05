const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../database');
const { JWT_SECRET, createSession } = require('./sessionService');

const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');

async function issueRefreshToken(user, metadata = {}) {
  const token = crypto.randomBytes(48).toString('base64url');
  const familyId = metadata.familyId || crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 86400000).toISOString();
  await db('refresh_tokens').insert({ id: crypto.randomBytes(32).toString('base64url'), user_id: user.id, token_hash: hash(token), family_id: familyId, session_id: metadata.sessionId || null, expires_at: expiresAt });
  return { token, familyId, expiresAt };
}

async function rotateRefreshToken(token, createAccessToken) {
  const record = await db('refresh_tokens').where({ token_hash: hash(token) }).first();
  if (!record || record.revoked_at || record.expires_at <= new Date().toISOString()) return null;
  if (record.used_at) {
    await db.transaction(async trx => {
      const sessionIds = await trx('refresh_tokens').where({ family_id: record.family_id }).whereNotNull('session_id').distinct().pluck('session_id');
      await trx('refresh_tokens').where({ family_id: record.family_id }).whereNull('revoked_at').update({ revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
      if (sessionIds.length) await trx('user_sessions').where({ user_id: record.user_id, status: 'active' }).whereIn('id', sessionIds)
        .update({ status: 'revoked', revoked_at: trx.fn.now(), updated_at: trx.fn.now() });
    });
    require('./metricsService').increment('refresh_token_events_total', { outcome: 'replay_family_revoked' });
    return null;
  }
  const user = await db('users').where({ id: record.user_id }).first();
  if (!user) return null;
  let sessionId = record.session_id;
  const activeSession = sessionId ? await db('user_sessions').where({ id: sessionId, user_id: user.id, status: 'active' }).first() : null;
  if (!activeSession) sessionId = await createSession(user.id, { deviceName: 'Refresh token' });
  else await db('user_sessions').where({ id: sessionId }).update({ last_seen_at: db.fn.now(), updated_at: db.fn.now() });
  await db('refresh_tokens').where({ id: record.id }).update({ used_at: db.fn.now(), updated_at: db.fn.now() });
  const next = await issueRefreshToken(user, { familyId: record.family_id, sessionId });
  return { accessToken: createAccessToken(user, sessionId), refreshToken: next.token, expiresAt: next.expiresAt };
}

function createAccessToken(user, sessionId) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.session_version || 0, sessionId }, JWT_SECRET, { expiresIn: 15 * 60 });
}

async function revokeRefreshTokensForSessions(userId, sessionIds, database = db) {
  if (!sessionIds.length) return 0;
  return database('refresh_tokens').where({ user_id: userId }).whereIn('session_id', sessionIds).whereNull('revoked_at')
    .update({ revoked_at: database.fn.now(), updated_at: database.fn.now() });
}

module.exports = { REFRESH_TTL_DAYS, createAccessToken, issueRefreshToken, revokeRefreshTokensForSessions, rotateRefreshToken };
