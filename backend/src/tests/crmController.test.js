process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');
const { acceptCurrentWaiver } = require('./helpers/waiverFixture');

describe('CRM churn alerts and NPS', () => {
  let personalId;
  let studentId;
  let personalToken;
  let studentToken;
  let alertId;
  let surveyId;

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({ name: 'CRM Personal', email: `crm-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [studentId] = await db('users').insert({ name: 'CRM Student', email: `crm-student-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'student', created_at: '2026-07-01 10:00:00', updated_at: '2026-07-01 10:00:00' });
    await db('student_profiles').insert({ student_id: studentId, personal_id: personalId, relationship_status: 'active' });
    await acceptCurrentWaiver(db, studentId);
    await db('workout_sessions').insert({ student_id: studentId, personal_id: personalId, workout_name: 'Old Workout', status: 'completed', started_at: '2026-07-10 10:00:00', completed_at: '2026-07-10 10:30:00' });
    personalToken = jwt.sign({ id: personalId, role: 'personal', sessionVersion: 0, csrf: 'crm-personal-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    studentToken = jwt.sign({ id: studentId, role: 'student', sessionVersion: 0, csrf: 'crm-student-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (personalId) await db('users').where({ id: personalId }).del();
    if (studentId) await db('users').where({ id: studentId }).del();
    await db.destroy();
  });

  test('runs a daily job, creates one churn alert and one pending NPS survey', async () => {
    const denied = await request(app).post('/api/crm/run-daily').set('Authorization', `Bearer ${studentToken}`).send({});
    expect(denied.statusCode).toBe(403);

    const result = await request(app).post('/api/crm/run-daily').set('Authorization', `Bearer ${personalToken}`).send({ thresholdDays: 5 });
    expect(result.statusCode).toBe(202);
    expect(result.body.alerts).toHaveLength(1);
    expect(result.body.surveys).toHaveLength(1);
    alertId = result.body.alerts[0].id;
    surveyId = result.body.surveys[0].id;

    const replay = await request(app).post('/api/crm/run-daily').set('Authorization', `Bearer ${personalToken}`).send({ thresholdDays: 5 });
    expect(replay.statusCode).toBe(202);
    expect(await db('crm_alerts').where({ personal_id: personalId, student_id: studentId }).count('* as count').first()).toMatchObject({ count: 1 });
    expect(replay.body.surveys).toHaveLength(0);
  });

  test('enforces personal alert ownership and allows resolution', async () => {
    const alerts = await request(app).get('/api/crm/alerts').set('Authorization', `Bearer ${personalToken}`);
    expect(alerts.statusCode).toBe(200);
    expect(alerts.body[0]).toMatchObject({ id: alertId, studentId, status: 'open' });

    const resolved = await request(app).patch(`/api/crm/alerts/${alertId}/resolve`).set('Authorization', `Bearer ${personalToken}`).send({});
    expect(resolved.statusCode).toBe(200);
    const repeated = await request(app).patch(`/api/crm/alerts/${alertId}/resolve`).set('Authorization', `Bearer ${personalToken}`).send({});
    expect(repeated.statusCode).toBe(404);
  });

  test('lets the student answer NPS once and exposes the result to the personal', async () => {
    const pending = await request(app).get('/api/student/nps').set('Authorization', `Bearer ${studentToken}`);
    expect(pending.statusCode).toBe(200);
    expect(pending.body).toEqual([{ id: surveyId, sentAt: expect.any(String) }]);

    const response = await request(app).post(`/api/student/nps/${surveyId}/respond`).set('Authorization', `Bearer ${studentToken}`).send({ score: 9, comment: 'Muito bom' });
    expect(response.statusCode).toBe(200);
    const repeated = await request(app).post(`/api/student/nps/${surveyId}/respond`).set('Authorization', `Bearer ${studentToken}`).send({ score: 8 });
    expect(repeated.statusCode).toBe(404);

    const surveys = await request(app).get('/api/crm/nps').set('Authorization', `Bearer ${personalToken}`);
    expect(surveys.statusCode).toBe(200);
    expect(surveys.body[0]).toMatchObject({ id: surveyId, studentId, status: 'responded', score: 9, comment: 'Muito bom' });
  });
});
