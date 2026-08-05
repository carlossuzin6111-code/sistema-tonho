const db = require('../database');
const crypto = require('crypto');
const metricsService = require('../services/metricsService');

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((result, key) => {
      result[key] = canonicalize(value[key]);
      return result;
    }, {});
  }
  return value;
}

function requestIdentity(req) {
  const method = req.method.toUpperCase();
  const path = req.baseUrl + req.path;
  const fingerprint = crypto.createHash('sha256')
    .update(`${method}\n${path}\n${JSON.stringify(canonicalize(req.body || {}))}`)
    .digest('hex');
  return { method, path, fingerprint };
}

function idempotency(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100 || !req.user) return next();
  const identity = requestIdentity(req);
  db('idempotency_keys').where({ key }).first().then(existing => {
    if (existing) {
      if (existing.user_id !== req.user.id || (existing.request_fingerprint && existing.request_fingerprint !== identity.fingerprint)) {
        metricsService.increment('idempotency_requests_total', { outcome: 'conflict' });
        return res.status(409).json({ error: 'Idempotency-Key was already used for a different request' });
      }
      metricsService.increment('idempotency_requests_total', { outcome: 'replayed' });
      return res.status(existing.response_status).type('application/json').send(existing.response_body);
    }
    const originalJson = res.json.bind(res);
    res.json = payload => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        const record = {
          key, user_id: req.user.id, response_status: status, response_body: JSON.stringify(payload),
          request_method: identity.method, request_path: identity.path, request_fingerprint: identity.fingerprint
        };
        db('idempotency_keys').insert(record).then(() => {
          metricsService.increment('idempotency_requests_total', { outcome: 'stored' });
          originalJson(payload);
        }).catch(error => {
          console.error('Idempotency persistence error:', error.message);
          originalJson(payload);
        });
        return res;
      }
      return originalJson(payload);
    };
    next();
  }).catch(next);
}

module.exports = { idempotency, requestIdentity };
