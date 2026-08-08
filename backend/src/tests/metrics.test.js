process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../index');
const db = require('../database');
const metricsService = require('../services/metricsService');
const { JWT_SECRET } = require('../services/sessionService');
const { acceptCurrentWaiver } = require('./helpers/waiverFixture');

describe('protected operational metrics', () => {
  let adminId;
  let adminToken;
  let studentId;
  let personalId;
  let studentToken;

  beforeAll(async () => {
    await db.ready;
    [adminId] = await db('users').insert({ name: 'Metrics Admin', email: `metrics-admin-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'admin' });
    [personalId] = await db('users').insert({ name: 'Metrics Personal', email: `metrics-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [studentId] = await db('users').insert({ name: 'Metrics Student', email: `metrics-student-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'student' });
    await db('student_profiles').insert({ student_id: studentId, personal_id: personalId });
    await acceptCurrentWaiver(db, studentId);
    adminToken = jwt.sign({ id: adminId, role: 'admin', sessionVersion: 0, csrf: 'metrics-admin-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    studentToken = jwt.sign({ id: studentId, role: 'student', sessionVersion: 0, csrf: 'metrics-student-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (adminId) await db('users').where({ id: adminId }).del();
    if (studentId) await db('users').where({ id: studentId }).del();
    if (personalId) await db('users').where({ id: personalId }).del();
    await db.destroy();
  });

  beforeEach(() => metricsService.reset());

  test('exposes metrics only to support/admin roles and propagates request id', async () => {
    const health = await request(app).get('/api/health').set('X-Request-Id', 'test-request-123');
    expect(health.statusCode).toBe(200);
    expect(health.headers['x-request-id']).toBe('test-request-123');
    const denied = await request(app).get('/api/metrics').set('Authorization', `Bearer ${studentToken}`);
    expect(denied.statusCode).toBe(403);
    const metrics = await request(app).get('/api/metrics').set('Authorization', `Bearer ${adminToken}`);
    expect(metrics.statusCode).toBe(200);
    expect(metrics.headers['cache-control']).toContain('no-store');
    expect(metrics.headers['ratelimit']).toBeDefined();
    expect(metrics.body.generatedAt).toEqual(expect.any(String));
    expect(metrics.body.metrics).toEqual(expect.arrayContaining([expect.objectContaining({ name: 'http_requests_total', labels: expect.objectContaining({ path: '/api/health', status: 200 }), value: 1 })]));
    expect(metrics.body.metrics).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'http_request_duration_ms_count', labels: expect.objectContaining({ path: '/api/health' }), value: 1 }),
      expect.objectContaining({ name: 'http_request_duration_ms_sum', labels: expect.objectContaining({ path: '/api/health' }) })
    ]));
  });

  test('bounds metric cardinality', () => {
    for (let i = 0; i < metricsService.MAX_SERIES + 100; i += 1) metricsService.increment('bounded_metric', { value: `v-${i}` });
    expect(metricsService.snapshot().length).toBeLessThanOrEqual(metricsService.MAX_SERIES);
  });

  test('exports Prometheus text and uses route templates instead of resource identifiers', async () => {
    db.observeDatabaseError(Object.assign(new Error('database is locked'), { code: 'SQLITE_BUSY' }));
    await request(app).delete('/api/sessions/abcdefghijklmnopqrstuvwxyz123456').set('Authorization', `Bearer ${adminToken}`);
    await request(app).get('/api/not-found-attacker-controlled-value');
    const response = await request(app).get('/api/metrics?format=prometheus').set('Authorization', `Bearer ${adminToken}`);
    expect(response.statusCode).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('http_requests_total{method="DELETE",path="/api/sessions/:id",status="404"} 1');
    expect(response.text).toMatch(/http_request_duration_ms_(?:sum|count)\{/);
    expect(response.text).toContain('sqlite_errors_total{code="SQLITE_BUSY"} 1');
    expect(response.text).not.toContain('abcdefghijklmnopqrstuvwxyz123456');
    expect(response.text).toContain('path="unmatched"');
    expect(response.text).not.toContain('not-found-attacker-controlled-value');
  });
});
