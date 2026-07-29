const express = require('express');
const cors = require('cors');
const request = require('supertest');
const {
  createAuthRateLimiter,
  createCorsOptions,
  createHelmetMiddleware,
  jsonErrorHandler,
  permissionsPolicy,
  preventResponseCaching
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

  test('prevents API responses from being stored by browsers or intermediaries', async () => {
    const app = express();
    app.disable('etag');
    app.use(preventResponseCaching);
    app.get('/private-data', (req, res) => res.json({ weight: 78.4 }));

    const response = await request(app).get('/private-data');

    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(response.headers.pragma).toBe('no-cache');
    expect(response.headers.etag).toBeUndefined();
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

  test('combines client IP and submitted account in the authentication budget', async () => {
    const app = express();
    app.use(express.json());
    app.use(createAuthRateLimiter({ windowMs: 60_000, limit: 1 }));
    app.post('/login', (req, res) => res.status(401).json({ error: 'invalid' }));

    await request(app).post('/login').send({ email: 'first@example.com' }).expect(401);
    await request(app).post('/login').send({ email: 'second@example.com' }).expect(401);
    await request(app).post('/login').send({ email: 'first@example.com' }).expect(429);
  });

  test('keeps login and registration failure budgets independent', async () => {
    const app = express();
    const registrationLimiter = createAuthRateLimiter({
      windowMs: 60_000,
      limit: 1,
      identifier: 'registration'
    });
    const loginLimiter = createAuthRateLimiter({
      windowMs: 60_000,
      limit: 1,
      identifier: 'login'
    });
    app.post('/register', registrationLimiter, (req, res) => res.sendStatus(401));
    app.post('/login', loginLimiter, (req, res) => res.sendStatus(401));

    await request(app).post('/register').expect(401);
    await request(app).post('/register').expect(429);
    await request(app).post('/login').expect(401);
    await request(app).post('/login').expect(429);
  });

  test('keys failures by the client address supplied by one trusted proxy', async () => {
    const app = express();
    app.set('trust proxy', 1);
    app.use(createAuthRateLimiter({ windowMs: 60_000, limit: 1 }));
    app.post('/login', (req, res) => res.status(401).json({ ip: req.ip }));

    const firstClient = '198.51.100.10';
    const secondClient = '203.0.113.20';
    const firstAttempt = await request(app)
      .post('/login')
      .set('X-Forwarded-For', firstClient);
    const otherClientAttempt = await request(app)
      .post('/login')
      .set('X-Forwarded-For', secondClient);
    const blocked = await request(app)
      .post('/login')
      .set('X-Forwarded-For', firstClient);

    expect(firstAttempt.statusCode).toBe(401);
    expect(firstAttempt.body.ip).toBe(firstClient);
    expect(otherClientAttempt.statusCode).toBe(401);
    expect(otherClientAttempt.body.ip).toBe(secondClient);
    expect(blocked.statusCode).toBe(429);
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

  test.each([
    ['insecure URL', 'http://example.com/exercise.gif'],
    ['script URL', 'javascript:alert(1)'],
    ['unapproved HTTPS host', 'https://example.com/exercise.gif'],
    ['SVG data URL', 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
    ['malformed raster data URL', 'data:image/png;base64,not_valid!'],
    ['image with a mismatched signature', 'data:image/png;base64,R0lGODlh']
  ])('rejects %s for catalog exercise images', async (label, gifUrl) => {
    const app = express();
    app.use(express.json());
    app.post('/catalog', validateBody('catalogExercise'), (req, res) => res.sendStatus(204));

    const response = await request(app).post('/catalog').send({ name: 'Exercise', gifUrl });

    expect(response.statusCode).toBe(400);
    expect(response.body.details[0].field).toBe('gifUrl');
  });

  test.each([
    ['approved HTTPS URL', 'https://raw.githubusercontent.com/example/exercise.gif'],
    ['PNG data URL', 'data:image/png;base64,iVBORw0KGgo='],
    ['empty image', null]
  ])('accepts %s for catalog exercise images', async (label, gifUrl) => {
    const app = express();
    app.use(express.json());
    app.post('/catalog', validateBody('catalogExercise'), (req, res) => res.sendStatus(204));

    await request(app).post('/catalog').send({ name: 'Exercise', gifUrl }).expect(204);
  });

  test('rejects an oversized embedded catalog image', async () => {
    const app = express();
    app.use(express.json({ limit: '600kb' }));
    app.post('/catalog', validateBody('catalogExercise'), (req, res) => res.sendStatus(204));
    const gifUrl = `data:image/png;base64,${'A'.repeat(525000)}`;

    const response = await request(app).post('/catalog').send({ name: 'Exercise', gifUrl });

    expect(response.statusCode).toBe(400);
    expect(response.body.details[0].field).toBe('gifUrl');
  });
});
