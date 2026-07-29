process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');

describe('geofence check-ins', () => {
  let personalId;
  let studentId;
  let geofenceId;
  let checkinId;
  let personalToken;
  let studentToken;

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({ name: 'Geofence Personal', email: `geo-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [studentId] = await db('users').insert({ name: 'Geofence Student', email: `geo-student-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'student' });
    await db('student_profiles').insert({ student_id: studentId, personal_id: personalId, relationship_status: 'active' });
    personalToken = jwt.sign({ id: personalId, role: 'personal', sessionVersion: 0, csrf: 'geo-personal-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    studentToken = jwt.sign({ id: studentId, role: 'student', sessionVersion: 0, csrf: 'geo-student-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (personalId) await db('users').where({ id: personalId }).del();
    if (studentId) await db('users').where({ id: studentId }).del();
    await db.destroy();
  });

  test('creates a geofence and rejects invalid radius', async () => {
    const invalid = await request(app).post('/api/personal/geofences').set('Authorization', `Bearer ${personalToken}`).send({ name: 'Academia', latitude: -23.55, longitude: -46.63, radiusMeters: 5 });
    expect(invalid.statusCode).toBe(400);
    const created = await request(app).post('/api/personal/geofences').set('Authorization', `Bearer ${personalToken}`).send({ name: 'Academia', latitude: -23.55, longitude: -46.63, radiusMeters: 150 });
    expect(created.statusCode).toBe(201);
    geofenceId = created.body.id;
  });

  test('enforces distance and makes check-in idempotent', async () => {
    const outside = await request(app).post('/api/student/checkins').set('Authorization', `Bearer ${studentToken}`).send({ geofenceId, latitude: -23.60, longitude: -46.70, clientEventId: 'outside-1' });
    expect(outside.statusCode).toBe(422);
    const inside = await request(app).post('/api/student/checkins').set('Authorization', `Bearer ${studentToken}`).send({ geofenceId, latitude: -23.5501, longitude: -46.6301, clientEventId: 'inside-1' });
    expect(inside.statusCode).toBe(201);
    checkinId = inside.body.id;
    const replay = await request(app).post('/api/student/checkins').set('Authorization', `Bearer ${studentToken}`).send({ geofenceId, latitude: -23.5501, longitude: -46.6301, clientEventId: 'inside-1' });
    expect(replay.statusCode).toBe(200);
    expect(replay.body).toMatchObject({ id: checkinId, duplicate: true });
  });

  test('allows personal visibility and student checkout', async () => {
    const list = await request(app).get('/api/personal/checkins').set('Authorization', `Bearer ${personalToken}`);
    expect(list.statusCode).toBe(200);
    expect(list.body[0]).toMatchObject({ id: checkinId, studentId });
    const checkout = await request(app).post(`/api/student/checkins/${checkinId}/checkout`).set('Authorization', `Bearer ${studentToken}`).send({});
    expect(checkout.statusCode).toBe(200);
    const repeated = await request(app).post(`/api/student/checkins/${checkinId}/checkout`).set('Authorization', `Bearer ${studentToken}`).send({});
    expect(repeated.statusCode).toBe(404);
  });
});
