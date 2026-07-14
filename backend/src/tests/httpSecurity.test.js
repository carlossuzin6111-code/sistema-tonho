const express = require('express');
const cors = require('cors');
const request = require('supertest');
const {
  createAuthRateLimiter,
  createCorsOptions,
  createHelmetMiddleware,
  jsonErrorHandler,
  permissionsPolicy
} = require('../middleware/httpSecurity');
const { validateBody, validateIdParam } = require('../middleware/validateRequest');

describe('HTTP security middleware', () => {
  test('sets defensive headers without forcing HSTS outside production', async () => {
    const app = express();
    app.use(createHelmetMiddleware('test'));
    app.use(permissionsPolicy);
    app.get('/health', (req, res) => res.json({ ok: true }));

    const response = await request(app).get('/health');

    expect(response.statusCode).toBe(200);
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    expect(response.headers['referrer-policy']).toBe('no-referrer');
    expect(response.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
    expect(response.headers['x-powered-by']).toBeUndefined();
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  test('reflects only allowlisted browser origins', async () => {
    const app = express();
    app.use(cors(createCorsOptions(['https://allowed.example'])));
    app.get('/resource', (req, res) => res.json({ ok: true }));

    const allowed = await request(app)
      .get('/resource')
      .set('Origin', 'https://allowed.example');
    const blocked = await request(app)
      .get('/resource')
      .set('Origin', 'https://blocked.example');
    const noOrigin = await request(app).get('/resource');

    expect(allowed.headers['access-control-allow-origin']).toBe('https://allowed.example');
    expect(allowed.headers['access-control-allow-credentials']).toBe('true');
    expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
    expect(noOrigin.statusCode).toBe(200);
  });

  test('returns 429 after repeated failed authentication attempts', async () => {
    const app = express();
    app.use(createAuthRateLimiter({ windowMs: 60_000, limit: 2 }));
    app.post('/login', (req, res) => res.status(401).json({ error: 'invalid' }));

    await request(app).post('/login').expect(401);
    await request(app).post('/login').expect(401);
    const blocked = await request(app).post('/login');

    expect(blocked.statusCode).toBe(429);
    expect(blocked.body.error).toMatch(/too many authentication attempts/i);
    expect(blocked.headers).toHaveProperty('ratelimit-policy');
    expect(blocked.headers['x-ratelimit-limit']).toBeUndefined();
  });

  test('normalizes oversized and malformed JSON errors', async () => {
    const app = express();
    app.use(express.json({ limit: '1kb' }));
    app.post('/payload', (req, res) => res.sendStatus(204));
    app.use(jsonErrorHandler);

    const oversized = await request(app)
      .post('/payload')
      .send({ value: 'x'.repeat(2_000) });
    const malformed = await request(app)
      .post('/payload')
      .set('Content-Type', 'application/json')
      .send('{"broken":');

    expect(oversized.statusCode).toBe(413);
    expect(oversized.body.error).toBe('Request body is too large');
    expect(malformed.statusCode).toBe(400);
    expect(malformed.body.error).toBe('Invalid JSON body');
  });
});

describe('centralized request validation', () => {
  test('rejects invalid fields before the route handler', async () => {
    const app = express();
    app.use(express.json());
    app.post('/chat', validateBody('chatMessage'), (req, res) => res.sendStatus(204));

    const response = await request(app)
      .post('/chat')
      .send({ receiverId: -1, message: 'x'.repeat(2_001) });

    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Invalid request data');
    expect(response.body.details.map(detail => detail.field)).toEqual(['receiverId', 'message']);
  });

  test('rejects invalid route identifiers', async () => {
    const app = express();
    app.delete('/resources/:id', validateIdParam(), (req, res) => res.sendStatus(204));

    const response = await request(app).delete('/resources/not-a-number');

    expect(response.statusCode).toBe(400);
    expect(response.body.details[0].field).toBe('id');
  });
});
