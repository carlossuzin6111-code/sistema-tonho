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

function applyAuthentication(req, authentication) {
  req.user = verifySessionToken(authentication.token);
  req.authSource = authentication.source;
}

function optionalAuthentication(req, res, next) {
  const authentication = extractAuthentication(req);
  if (authentication) {
    try {
      applyAuthentication(req, authentication);
    } catch (error) {
      req.authError = error;
    }
  }
  next();
}

function authenticateToken(req, res, next) {
  if (req.user) return next();

  const authentication = extractAuthentication(req);
  if (!authentication) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    applyAuthentication(req, authentication);
    return next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
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

  req.cookies = req.cookies || parseCookies(req.headers.cookie);
  const headerToken = req.headers['x-csrf-token'];
  const cookieToken = req.cookies[CSRF_COOKIE];

  if (!safeEqual(headerToken, cookieToken) || !safeEqual(headerToken, req.user.csrf)) {
    return res.status(403).json({ error: 'Invalid CSRF token' });
  }
  return next();
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
