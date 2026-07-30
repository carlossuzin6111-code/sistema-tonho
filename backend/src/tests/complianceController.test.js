process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');

describe('LGPD compliance endpoints', () => {
  let userId;
  let personalId;
  let token;
  const password = 'ValidCurrentPassword123!';

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({ name: 'LGPD Personal', email: `lgpd-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [userId] = await db('users').insert({ name: 'LGPD User', email: `lgpd-${Date.now()}@fitlife.com`, password_hash: await bcrypt.hash(password, 10), role: 'student' });
    await db('student_profiles').insert({ student_id: userId, personal_id: personalId });
    token = jwt.sign({ id: userId, role: 'student', sessionVersion: 0, csrf: 'lgpd-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (userId) await db('users').where({ id: userId }).del();
    if (personalId) await db('users').where({ id: personalId }).del();
    await db.destroy();
  });

  test('exports only the authenticated user data without credential fields', async () => {
    const response = await request(app).get('/api/compliance/export').set('Authorization', `Bearer ${token}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toContain('no-store');
    expect(response.headers['content-disposition']).toContain(`fitlife-data-export-${userId}.json`);
    expect(response.body.user).toMatchObject({ id: userId, name: 'LGPD User' });
    expect(response.body.user.password_hash).toBeUndefined();
  });

  test('requires explicit confirmation and current password before anonymizing', async () => {
    const wrong = await request(app).post('/api/compliance/delete').set('Authorization', `Bearer ${token}`).send({ confirmation: 'DELETE MY ACCOUNT', currentPassword: 'wrong' });
    expect(wrong.statusCode).toBe(403);
    const missingConfirmation = await request(app).post('/api/compliance/delete').set('Authorization', `Bearer ${token}`).send({ currentPassword: password });
    expect(missingConfirmation.statusCode).toBe(400);
  });

  test('anonymizes the account and revokes the current session', async () => {
    const deleted = await request(app).post('/api/compliance/delete').set('Authorization', `Bearer ${token}`).send({ confirmation: 'DELETE MY ACCOUNT', currentPassword: password });
    expect(deleted.statusCode).toBe(202);
    const anonymized = await db('users').where({ id: userId }).first();
    expect(anonymized).toMatchObject({ name: `Deleted user ${userId}`, email: `deleted+${userId}@invalid.local`, account_status: 'archived' });
    const revoked = await request(app).get('/api/compliance/export').set('Authorization', `Bearer ${token}`);
    expect(revoked.statusCode).toBe(403);
  });
});
