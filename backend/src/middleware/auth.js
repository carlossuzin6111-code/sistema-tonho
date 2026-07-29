const crypto = require('crypto');
const {
  CSRF_COOKIE,
  JWT_SECRET,
  SESSION_COOKIE,
  parseCookies,
  verifySessionToken
} = require('../services/sessionService');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function extractAuthentication(req) {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return { source: 'bearer', token: authHeader.slice(7) };
  }

  req.cookies = req.cookies || parseCookies(req.headers.cookie);
  if (req.cookies[SESSION_COOKIE]) {
    return { source: 'cookie', token: req.cookies[SESSION_COOKIE] };
  }

  return null;
}

async function applyAuthentication(req, authentication) {
  const db = require('../database');
  const payload = verifySessionToken(authentication.token);
  const user = await db('users')
    .select('id', 'name', 'email', 'role', 'organization_role', 'session_version', 'must_change_password')
    .where('id', payload.id)
    .first();

  if (!user || (payload.sessionVersion || 0) !== user.session_version) {
    throw new Error('Session revoked');
  }

  req.user = {
    ...payload,
    name: user.name,
    email: user.email,
    role: user.role,
    organizationRole: user.organization_role || 'standalone',
    mustChangePassword: Boolean(user.must_change_password)
  };
  req.authSource = authentication.source;
}

async function optionalAuthentication(req, res, next) {
  const authentication = extractAuthentication(req);
  if (authentication) {
    try {
      await applyAuthentication(req, authentication);
    } catch (error) {
      req.authError = error;
    }
  }
  next();
}

async function authenticateToken(req, res, next) {
  if (req.user) {
    if (req.user.mustChangePassword && !isPasswordChangeExempt(req)) {
      return res.status(428).json({
        error: 'Password change required before accessing the application',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
    return next();
  }

  const authentication = extractAuthentication(req);
  if (!authentication) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    await applyAuthentication(req, authentication);
    if (req.user.mustChangePassword && !isPasswordChangeExempt(req)) {
      return res.status(428).json({
        error: 'Password change required before accessing the application',
        code: 'PASSWORD_CHANGE_REQUIRED'
      });
    }
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

function isPasswordChangeExempt(req) {
  const path = req.path || req.originalUrl?.split('?')[0];
  return (req.method === 'PUT' && path === '/api/profile/password')
    || (req.method === 'GET' && path === '/api/auth/me')
    || (req.method === 'POST' && path === '/api/auth/logout');
}

function safeEqual(left, right) {
  if (typeof left !== 'string' || typeof right !== 'string') return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function csrfProtection(req, res, next) {
  if (SAFE_METHODS.has(req.method)) {
    return next();
  }
  if (!req.user || req.authSource !== 'cookie') {
    return next();
  }

  const requestOrigin = req.headers.origin || refererOrigin(req.headers.referer);
  if (requestOrigin && !isTrustedOrigin(requestOrigin, req)) {
    return res.status(403).json({ error: 'Untrusted request origin' });
  }

  req.cookies = req.cookies || parseCookies(req.headers.cookie);
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies[CSRF_COOKIE];

  if (!safeEqual(headerToken, cookieToken) || !safeEqual(headerToken, req.user.csrf)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
}

function refererOrigin(referer) {
  if (!referer) return '';
  try { return new URL(referer).origin; } catch { return ''; }
}

function isTrustedOrigin(origin, req) {
  const configured = process.env.APP_ORIGIN;
  if (configured) return origin === configured.replace(/\/$/, '');
  return origin === `${req.protocol}://${req.get('host')}`;
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (req.user.role !== role) {
      return res.status(403).json({ error: `Requires role: ${role}` });
    }
    return next();
  };
}

module.exports = {
  JWT_SECRET,
  authenticateToken,
  csrfProtection,
  optionalAuthentication,
  requireRole
};
