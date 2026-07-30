const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required');
}

if (Buffer.byteLength(JWT_SECRET, 'utf8') < 32) {
  throw new Error('JWT_SECRET must contain at least 32 bytes');
}

const looksLikePlaceholder = /^(?:change|replace|example|default|development|test|ci|your)[-_ ]/i.test(JWT_SECRET);
const distinctCharacters = new Set(JWT_SECRET).size;

if (process.env.NODE_ENV === 'production' && (looksLikePlaceholder || distinctCharacters < 8)) {
  throw new Error('JWT_SECRET must be random and cannot use a placeholder in production');
}
const SESSION_COOKIE = 'fitlife_session';
const CSRF_COOKIE = 'fitlife_csrf';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;
const SESSION_IDLE_TIMEOUT_DAYS = Number(process.env.SESSION_IDLE_TIMEOUT_DAYS || 30);
const MAX_ACTIVE_SESSIONS = Math.max(1, Number(process.env.MAX_ACTIVE_SESSIONS || 5));

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, part) => {
    const separator = part.indexOf('=');
    if (separator === -1) return cookies;

    const name = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (!name) return cookies;

    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});
}

function serializeCookie(name, value, { httpOnly = false, maxAge = SESSION_MAX_AGE_SECONDS } = {}) {
  const attributes = [
    `${name}=${encodeURIComponent(value)}`,
    `Max-Age=${maxAge}`,
    `Path=${name === SESSION_COOKIE ? '/api' : '/'}`,
    'SameSite=Strict'
  ];

  if (httpOnly) attributes.push('HttpOnly');
  if (process.env.NODE_ENV === 'production') attributes.push('Secure');
  return attributes.join('; ');
}

async function createSession(userId, { deviceName = 'Unknown device', userAgent = null, ipAddress = null } = {}) {
  const sessionId = crypto.randomBytes(32).toString('base64url');
  const db = require('../database');
  await db('user_sessions').insert({ id: sessionId, user_id: userId, device_name: String(deviceName).slice(0, 120) || 'Unknown device', user_agent: userAgent ? String(userAgent).slice(0, 500) : null, ip_address: ipAddress ? String(ipAddress).slice(0, 64) : null });
  await pruneUserSessions(userId, db);
  return sessionId;
}

async function pruneUserSessions(userId, database = null) {
  const db = database || require('../database');
  const cutoff = new Date(Date.now() - SESSION_IDLE_TIMEOUT_DAYS * 24 * 60 * 60 * 1000).toISOString();
  await db('user_sessions').where({ user_id: userId, status: 'active' }).where('last_seen_at', '<', cutoff)
    .update({ status: 'revoked', revoked_at: db.fn.now(), updated_at: db.fn.now() });
  const active = await db('user_sessions').where({ user_id: userId, status: 'active' })
    .orderBy('last_seen_at', 'desc').select('id').offset(MAX_ACTIVE_SESSIONS);
  if (active.length) {
    await db('user_sessions').whereIn('id', active.map(row => row.id))
      .update({ status: 'revoked', revoked_at: db.fn.now(), updated_at: db.fn.now() });
  }
  return active.length;
}

function setSessionCookies(res, user, sessionId = null) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const sessionToken = jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sessionVersion: user.session_version || 0,
      csrf: csrfToken,
      ...(sessionId ? { sessionId } : {})
    },
    JWT_SECRET,
    { expiresIn: SESSION_MAX_AGE_SECONDS }
  );

  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, sessionToken, { httpOnly: true }));
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, csrfToken));
}

function clearSessionCookies(res) {
  res.append('Set-Cookie', serializeCookie(SESSION_COOKIE, '', { httpOnly: true, maxAge: 0 }));
  res.append('Set-Cookie', serializeCookie(CSRF_COOKIE, '', { maxAge: 0 }));
}

function verifySessionToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  CSRF_COOKIE,
  JWT_SECRET,
  SESSION_COOKIE,
  clearSessionCookies,
  createSession,
  MAX_ACTIVE_SESSIONS,
  pruneUserSessions,
  parseCookies,
  setSessionCookies,
  verifySessionToken
};
