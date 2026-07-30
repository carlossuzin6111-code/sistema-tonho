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
  await db('refresh_tokens').insert({ id: crypto.randomBytes(32).toString('base64url'), user_id: user.id, token_hash: hash(token), family_id: familyId, expires_at: expiresAt });
  return { token, familyId, expiresAt };
}

async function rotateRefreshToken(token, createAccessToken) {
  const record = await db('refresh_tokens').where({ token_hash: hash(token) }).first();
  if (!record || record.revoked_at || record.expires_at <= new Date().toISOString()) return null;
  if (record.used_at) {
    await db('refresh_tokens').where({ family_id: record.family_id }).whereNull('revoked_at').update({ revoked_at: db.fn.now(), updated_at: db.fn.now() });
    return null;
  }
  const user = await db('users').where({ id: record.user_id }).first();
  if (!user) return null;
  const sessionId = await createSession(user.id, { deviceName: 'Refresh token' });
  await db('refresh_tokens').where({ id: record.id }).update({ used_at: db.fn.now(), updated_at: db.fn.now() });
  const next = await issueRefreshToken(user, { familyId: record.family_id });
  return { accessToken: createAccessToken(user, sessionId), refreshToken: next.token, expiresAt: next.expiresAt };
}

function createAccessToken(user, sessionId) {
  return jwt.sign({ id: user.id, name: user.name, email: user.email, role: user.role, sessionVersion: user.session_version || 0, sessionId }, JWT_SECRET, { expiresIn: 15 * 60 });
}

module.exports = { REFRESH_TTL_DAYS, createAccessToken, issueRefreshToken, rotateRefreshToken };
