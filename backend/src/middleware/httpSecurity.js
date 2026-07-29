const helmet = require('helmet');
const { ipKeyGenerator, rateLimit } = require('express-rate-limit');

// Exercise images may be sent as a small Base64 data URL. This remains bounded
// and is paired with a stricter field-level limit in validateRequest.
const DEFAULT_BODY_LIMIT = '600kb';
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_RATE_LIMIT_MAX = 10;

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function allowedOrigins(value = process.env.CORS_ORIGINS || '') {
  return value
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean);
}

function createCorsOptions(origins = allowedOrigins()) {
  const allowlist = new Set(origins);

  return {
    origin(origin, callback) {
      // Requests without Origin are same-origin or non-browser clients.
      callback(null, !origin || allowlist.has(origin));
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type', 'X-CSRF-Token'],
    exposedHeaders: ['RateLimit', 'RateLimit-Policy', 'Retry-After'],
    maxAge: 600
  };
}

function createHelmetMiddleware(environment = process.env.NODE_ENV) {
  return helmet({
    // The public frontend is served by Nginx, which owns its CSP. Disabling CSP
    // here also avoids breaking Swagger UI's generated inline assets.
    contentSecurityPolicy: false,
    strictTransportSecurity: environment === 'production'
      ? { maxAge: 31536000, includeSubDomains: true }
      : false,
    xFrameOptions: { action: 'deny' }
  });
}

function permissionsPolicy(req, res, next) {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  next();
}

function preventResponseCaching(req, res, next) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Pragma', 'no-cache');
  next();
}

function createAuthRateLimiter(options = {}) {
  const windowMs = positiveInteger(
    options.windowMs ?? process.env.AUTH_RATE_LIMIT_WINDOW_MS,
    DEFAULT_RATE_LIMIT_WINDOW_MS
  );
  const limit = positiveInteger(
    options.limit ?? process.env.AUTH_RATE_LIMIT_MAX,
    DEFAULT_RATE_LIMIT_MAX
  );
  const identifier = options.identifier || 'authentication';

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    keyGenerator: req => {
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      return `${ipKeyGenerator(req.ip)}:${email || '*'}`;
    },
    identifier,
    message: { error: 'Too many authentication attempts. Try again later.' }
  });
}

function jsonErrorHandler(error, req, res, next) {
  if (error?.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Request body is too large' });
  }

  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({ error: 'Invalid JSON body' });
  }

  return next(error);
}

module.exports = {
  DEFAULT_BODY_LIMIT,
  allowedOrigins,
  createAuthRateLimiter,
  createCorsOptions,
  createHelmetMiddleware,
  jsonErrorHandler,
  permissionsPolicy,
  preventResponseCaching
};
