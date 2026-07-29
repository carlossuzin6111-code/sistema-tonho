process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../index');
const db = require('../database');

describe('SEC-08 PAR-Q waivers', () => {
  let token;
  let userId;
  beforeAll(async () => {
    await db.ready;
    await db('signed_waivers').del();
    await db('users').del();
    [userId] = await db('users').insert({ name: 'Waiver User', email: 'waiver@test.com', password_hash: 'hash', role: 'student' });
    token = jwt.sign({ id: userId, role: 'student', sessionVersion: 0 }, process.env.JWT_SECRET);
  });
  afterAll(async () => db.destroy());

  test('records a waiver once and returns the existing version on replay', async () => {
    const payload = { termsVersion: '2026.1', parqAnswers: { chestPain: false, clearedByDoctor: true } };
    const first = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send(payload);
    expect(first.statusCode).toBe(201);
    const replay = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send(payload);
    expect(replay.statusCode).toBe(200);
    expect(await db('signed_waivers').where({ user_id: userId })).toHaveLength(1);
  });
});
