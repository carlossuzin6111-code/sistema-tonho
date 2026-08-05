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

  const answers = {
    heartCondition: false,
    chestPainActivity: false,
    chestPainRest: false,
    balanceOrConsciousness: false,
    boneOrJointProblem: false,
    bloodPressureMedication: false,
    otherReason: false,
    acceptedTerms: true
  };

  test('requires the current waiver before student business routes', async () => {
    const status = await request(app).get('/api/profile/waivers/current').set('Authorization', `Bearer ${token}`);
    expect(status.statusCode).toBe(200);
    expect(status.body).toEqual(expect.objectContaining({ termsVersion: '2026.1', signed: false }));

    const blocked = await request(app).get('/api/chat').set('Authorization', `Bearer ${token}`);
    expect(blocked.statusCode).toBe(428);
    expect(blocked.body.code).toBe('WAIVER_REQUIRED');
  });

  test('rejects incomplete answers and a client-selected version', async () => {
    const incomplete = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send({ termsVersion: '2026.1', parqAnswers: { ...answers, acceptedTerms: false } });
    expect(incomplete.statusCode).toBe(400);
    const stale = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send({ termsVersion: 'old', parqAnswers: answers });
    expect(stale.statusCode).toBe(409);
    expect(stale.body.termsVersion).toBe('2026.1');
  });

  test('records a waiver once and returns the existing version on replay', async () => {
    const payload = { termsVersion: '2026.1', parqAnswers: answers };
    const first = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send(payload);
    expect(first.statusCode).toBe(201);
    const replay = await request(app).post('/api/profile/waivers').set('Authorization', `Bearer ${token}`).send(payload);
    expect(replay.statusCode).toBe(200);
    expect(await db('signed_waivers').where({ user_id: userId })).toHaveLength(1);
    const status = await request(app).get('/api/profile/waivers/current').set('Authorization', `Bearer ${token}`);
    expect(status.body).toEqual(expect.objectContaining({ termsVersion: '2026.1', signed: true, signedAt: expect.any(String) }));
  });
});
