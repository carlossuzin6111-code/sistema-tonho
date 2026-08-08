const crypto = require('crypto');

function correlationId(req, res, next) {
  const incoming = typeof req.get('x-correlation-id') === 'string' ? req.get('x-correlation-id').trim() : '';
  const id = /^[A-Za-z0-9._:-]{1,80}$/.test(incoming) ? incoming : crypto.randomUUID();
  req.correlationId = id;
  res.set('X-Correlation-Id', id);
  next();
}

module.exports = { correlationId };
