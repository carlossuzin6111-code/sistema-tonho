process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const crypto = require('crypto');
const request = require('supertest');
const app = require('../index');
const db = require('../database');

describe('SEC-05 email verification', () => {
  let token;
  let userId;
  beforeAll(async () => {
    await db.ready;
    await db('email_verification_tokens').del();
    await db('users').del();
    [userId] = await db('users').insert({ name: 'Unverified', email: 'unverified@test.com', password_hash: 'hash', role: 'personal' });
    token = crypto.randomBytes(32).toString('base64url');
    await db('email_verification_tokens').insert({ user_id: userId, token_hash: crypto.createHash('sha256').update(token).digest('hex'), expires_at: new Date(Date.now() + 3600000).toISOString() });
  });
  afterAll(async () => db.destroy());

  test('verifies a valid token once', async () => {
    const response = await request(app).post('/api/auth/verify-email').send({ token });
    expect(response.statusCode).toBe(200);
    expect((await db('users').where({ id: userId }).first()).email_verified_at).toBeTruthy();
    const replay = await request(app).post('/api/auth/verify-email').send({ token });
    expect(replay.statusCode).toBe(400);
  });
});
