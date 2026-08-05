process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');
const { acceptCurrentWaiver } = require('./helpers/waiverFixture');

describe('wearable integrations', () => {
  let studentId;
  let personalId;
  let token;
  let connectionId;

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({
      name: 'Wearable Personal',
      email: `wearable-personal-${Date.now()}@fitlife.com`,
      password_hash: 'not-used',
      role: 'personal'
    });
    [studentId] = await db('users').insert({
      name: 'Wearable Student',
      email: `wearable-${Date.now()}@fitlife.com`,
      password_hash: 'not-used',
      role: 'student'
    });
    await db('student_profiles').insert({ student_id: studentId, personal_id: personalId });
    await acceptCurrentWaiver(db, studentId);
    token = jwt.sign({ id: studentId, role: 'student', sessionVersion: 0, csrf: 'wearable-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (studentId) await db('users').where({ id: studentId }).del();
    if (personalId) await db('users').where({ id: personalId }).del();
    await db.destroy();
  });

  test('rejects unsupported providers and creates a pending connection', async () => {
    const invalid = await request(app)
      .post('/api/wearables/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'unknown' });
    expect(invalid.statusCode).toBe(400);

    const created = await request(app)
      .post('/api/wearables/connections')
      .set('Authorization', `Bearer ${token}`)
      .send({ provider: 'garmin', externalAccountId: 'garmin-user-1', scopes: ['sleep', 'hrv'] });
    expect(created.statusCode).toBe(202);
    expect(created.body).toMatchObject({ provider: 'garmin', status: 'pending', scopes: ['sleep', 'hrv'] });
    connectionId = created.body.id;

    const listed = await request(app)
      .get('/api/wearables/connections')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.statusCode).toBe(200);
    expect(listed.body[0]).toMatchObject({ id: connectionId, provider: 'garmin', status: 'pending' });
  });

  test('ingests sleep/HRV samples idempotently and filters history', async () => {
    await db('wearable_connections').where({ id: connectionId }).update({ status: 'active' });
    const payload = {
      samples: [
        { metricType: 'sleep', observedAt: '2026-07-29T06:00:00.000Z', value: 420, unit: 'minutes', sourceEventId: 'sleep-1' },
        { metricType: 'hrv', observedAt: '2026-07-29T06:01:00.000Z', value: 55.5, unit: 'ms', sourceEventId: 'hrv-1' }
      ]
    };
    const ingested = await request(app)
      .post(`/api/wearables/connections/${connectionId}/metrics`)
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(ingested.statusCode).toBe(202);
    expect(ingested.body).toEqual({ accepted: 2 });

    const replay = await request(app)
      .post(`/api/wearables/connections/${connectionId}/metrics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ samples: [{ ...payload.samples[0], value: 430 }] });
    expect(replay.statusCode).toBe(202);
    expect(replay.body).toEqual({ accepted: 1 });

    const history = await request(app)
      .get('/api/wearables/metrics?metricType=sleep')
      .set('Authorization', `Bearer ${token}`);
    expect(history.statusCode).toBe(200);
    expect(history.body).toHaveLength(1);
    expect(history.body[0]).toMatchObject({ metricType: 'sleep', value: 430, unit: 'minutes', provider: 'garmin' });
  });

  test('rejects malformed samples and revokes the connection', async () => {
    const invalid = await request(app)
      .post(`/api/wearables/connections/${connectionId}/metrics`)
      .set('Authorization', `Bearer ${token}`)
      .send({ samples: [{ metricType: 'sleep', observedAt: 'not-a-date', value: -1, unit: 'minutes' }] });
    expect(invalid.statusCode).toBe(400);

    const revoked = await request(app)
      .delete(`/api/wearables/connections/${connectionId}`)
      .set('Authorization', `Bearer ${token}`);
    expect(revoked.statusCode).toBe(200);

    const history = await request(app)
      .get('/api/wearables/metrics')
      .set('Authorization', `Bearer ${token}`);
    expect(history.statusCode).toBe(200);
    expect(history.body).toEqual([]);
  });
});
