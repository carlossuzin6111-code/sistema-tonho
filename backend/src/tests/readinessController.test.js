process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');

describe('daily readiness check-in', () => {
  let personalId;
  let studentId;
  let personalToken;
  let studentToken;

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({ name: 'Readiness Personal', email: `ready-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [studentId] = await db('users').insert({ name: 'Readiness Student', email: `ready-student-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'student' });
    await db('student_profiles').insert({ student_id: studentId, personal_id: personalId, relationship_status: 'active' });
    personalToken = jwt.sign({ id: personalId, role: 'personal', sessionVersion: 0, csrf: 'ready-personal-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    studentToken = jwt.sign({ id: studentId, role: 'student', sessionVersion: 0, csrf: 'ready-student-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (personalId) await db('users').where({ id: personalId }).del();
    if (studentId) await db('users').where({ id: studentId }).del();
    await db.destroy();
  });

  test('validates values and upserts one check-in per day', async () => {
    const invalid = await request(app).post('/api/student/readiness').set('Authorization', `Bearer ${studentToken}`).send({ doms: 6, sleepQuality: 2, fatigue: 4, mood: 3 });
    expect(invalid.statusCode).toBe(400);
    const created = await request(app).post('/api/student/readiness').set('Authorization', `Bearer ${studentToken}`).send({ date: '2026-07-29', doms: 4, sleepQuality: 2, fatigue: 4, mood: 3, notes: 'Dormi pouco' });
    expect(created.statusCode).toBe(201);
    expect(created.body.recommendation).toMatchObject({ code: 'recovery', volumeMultiplier: 0.8 });
    const updated = await request(app).post('/api/student/readiness').set('Authorization', `Bearer ${studentToken}`).send({ date: '2026-07-29', doms: 2, sleepQuality: 4, fatigue: 2, mood: 4 });
    expect(updated.statusCode).toBe(200);
    expect(await db('readiness_checkins').where({ student_id: studentId, date_key: '2026-07-29' })).toHaveLength(1);
  });

  test('protects ownership and exposes recommendation/history', async () => {
    const recommendation = await request(app).get('/api/student/readiness/recommendation').set('Authorization', `Bearer ${studentToken}`);
    expect(recommendation.statusCode).toBe(200);
    expect(recommendation.body).toMatchObject({ date: '2026-07-29', code: 'normal', volumeMultiplier: 1 });
    const personal = await request(app).get(`/api/personal/students/${studentId}/readiness`).set('Authorization', `Bearer ${personalToken}`);
    expect(personal.statusCode).toBe(200);
    expect(personal.body[0]).toMatchObject({ studentId, date: '2026-07-29', doms: 2 });
    const denied = await request(app).get('/api/student/readiness').set('Authorization', `Bearer ${personalToken}`);
    expect(denied.statusCode).toBe(403);
  });
});
