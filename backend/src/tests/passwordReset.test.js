const request = require('supertest');
const crypto = require('crypto');
const db = require('../database');
const bcrypt = require('bcryptjs');

let app;

describe('SEC-04 — Self-service Password Reset for Personals', () => {
  let userEmail = 'personal_reset_test@example.com';
  let userId;
  let initialPassword = 'OldPassword123!';
  let newPassword = 'NewPassword999!';

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';
    app = require('../index');
    await db.ready;
  });

  beforeEach(async () => {
    await db('password_reset_tokens').del();
    await db('audit_logs').del();
    await db('users').del();

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(initialPassword, salt);

    const [id] = await db('users').insert({
      name: 'Personal Reset Test',
      email: userEmail,
      password_hash: passwordHash,
      role: 'personal',
      session_version: 0
    });
    userId = id;
  });

  afterAll(async () => {
    await db('password_reset_tokens').del();
    await db('audit_logs').del();
    await db('users').del();
  });

  describe('POST /api/auth/forgot-password', () => {
    it('returns generic 200 message for non-existent email without leaking account state', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'nonexistent_email@example.com' });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toContain('Se o e-mail estiver cadastrado');

      const count = await db('password_reset_tokens').count('* as total').first();
      expect(Number(count.total)).toEqual(0);
    });

    it('creates a hashed token in database and returns token in test mode', async () => {
      const res = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: userEmail });

      expect(res.statusCode).toEqual(200);
      expect(res.body.message).toContain('Se o e-mail estiver cadastrado');
      expect(res.body.resetToken).toBeDefined();
      expect(typeof res.body.resetToken).toBe('string');

      const rawToken = res.body.resetToken;
      const expectedHash = crypto.createHash('sha256').update(rawToken).digest('hex');

      const record = await db('password_reset_tokens').where({ user_id: userId }).first();
      expect(record).toBeDefined();
      expect(record.token_hash).toEqual(expectedHash);
      expect(record.used_at).toBeNull();
    });
  });

  describe('POST /api/auth/reset-password', () => {
    it('rejects invalid or non-existent token with 400', async () => {
      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: 'invalid_token_string_with_32_characters_minimum', newPassword });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('inválido ou expirado');
    });

    it('rejects password shorter than 10 characters', async () => {
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: userEmail });

      const rawToken = forgotRes.body.resetToken;

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'short' });

      expect(res.statusCode).toEqual(400);
    });

    it('resets user password, updates session_version and marks token as used', async () => {
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: userEmail });

      const rawToken = forgotRes.body.resetToken;

      const resetRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword });

      expect(resetRes.statusCode).toEqual(200);
      expect(resetRes.body.message).toContain('Senha redefinida com sucesso');

      // Verify user in DB
      const updatedUser = await db('users').where({ id: userId }).first();
      expect(updatedUser.session_version).toEqual(1);

      // Verify token used_at is set
      const tokenRecord = await db('password_reset_tokens').where({ user_id: userId }).first();
      expect(tokenRecord.used_at).not.toBeNull();

      // Test login with old password fails
      const oldLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userEmail, password: initialPassword });
      expect(oldLoginRes.statusCode).toEqual(400);

      // Test login with new password succeeds
      const newLoginRes = await request(app)
        .post('/api/auth/login')
        .send({ email: userEmail, password: newPassword });
      expect(newLoginRes.statusCode).toEqual(200);
    });

    it('prevents reusing an already used token', async () => {
      const forgotRes = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: userEmail });

      const rawToken = forgotRes.body.resetToken;

      // First reset succeeds
      await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword });

      // Second reset with same token fails
      const reuseRes = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword: 'AnotherPassword999!' });

      expect(reuseRes.statusCode).toEqual(400);
      expect(reuseRes.body.error).toContain('inválido ou expirado');
    });

    it('rejects expired token', async () => {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expiredDate = new Date(Date.now() - 3600 * 1000); // 1 hour in the past

      await db('password_reset_tokens').insert({
        user_id: userId,
        token_hash: tokenHash,
        expires_at: expiredDate
      });

      const res = await request(app)
        .post('/api/auth/reset-password')
        .send({ token: rawToken, newPassword });

      expect(res.statusCode).toEqual(400);
      expect(res.body.error).toContain('inválido ou expirado');
    });
  });
});
