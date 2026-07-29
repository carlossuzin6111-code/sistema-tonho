const db = require('../database');

function idempotency(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 100 || !req.user) return next();
  db('idempotency_keys').where({ key, user_id: req.user.id }).first().then(existing => {
    if (existing) return res.status(existing.response_status).type('application/json').send(existing.response_body);
    const originalJson = res.json.bind(res);
    res.json = payload => {
      const status = res.statusCode;
      if (status >= 200 && status < 300) {
        db('idempotency_keys').insert({ key, user_id: req.user.id, response_status: status, response_body: JSON.stringify(payload) })
          .onConflict('key').ignore().catch(error => console.error('Idempotency persistence error:', error.message));
      }
      return originalJson(payload);
    };
    next();
  }).catch(next);
}

module.exports = { idempotency };
