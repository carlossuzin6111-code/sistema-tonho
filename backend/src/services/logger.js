const crypto = require('crypto');

const SENSITIVE_KEYS = /password|token|secret|authorization|cookie|accesskey|api[-_]?key/i;

function redact(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redact(item, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, SENSITIVE_KEYS.test(key) ? '[REDACTED]' : redact(item, depth + 1)]));
}

function write(level, message, context = {}) {
  const entry = { timestamp: new Date().toISOString(), level, service: 'fitlife-api', message: String(message), ...redact(context) };
  const output = JSON.stringify(entry);
  if (level === 'error' || level === 'warn') process.stderr.write(`${output}\n`);
  else if (process.env.NODE_ENV !== 'test') process.stdout.write(`${output}\n`);
  return entry;
}

const logger = { info: (message, context) => write('info', message, context), warn: (message, context) => write('warn', message, context), error: (message, context) => write('error', message, context), redact };

function requestLogger(req, res, next) {
  const requestId = req.headers['x-request-id'] && /^[A-Za-z0-9._-]{1,100}$/.test(req.headers['x-request-id']) ? req.headers['x-request-id'] : crypto.randomUUID();
  const started = process.hrtime.bigint();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  res.on('finish', () => {
    const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
    require('./metricsService').increment('http_requests_total', { method: req.method, path: req.path, status: res.statusCode });
    logger.info('http_request', { requestId, method: req.method, path: req.path, status: res.statusCode, durationMs: Math.round(durationMs * 100) / 100 });
  });
  return next();
}

module.exports = { logger, redact, requestLogger };
