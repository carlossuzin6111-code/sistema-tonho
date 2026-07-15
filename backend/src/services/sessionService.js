const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'fitlife_sync_super_secret_key_123';
const SESSION_COOKIE = 'fitlife_session';
const CSRF_COOKIE = 'fitlife_csrf';
const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

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

function setSessionCookies(res, user) {
  const csrfToken = crypto.randomBytes(32).toString('base64url');
  const sessionToken = jwt.sign(
    { id: user.id, name: user.name, email: user.email, role: user.role, csrf: csrfToken },
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
  parseCookies,
  setSessionCookies,
  verifySessionToken
};
