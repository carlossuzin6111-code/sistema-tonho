process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');
const { enqueueNotification } = require('../services/notificationService');
const { acceptCurrentWaiver } = require('./helpers/waiverFixture');

describe('notification center', () => {
  let userId;
  let personalId;
  let token;
  let notificationId;

  beforeAll(async () => {
    await db.ready;
    [personalId] = await db('users').insert({ name: 'Notification Personal', email: `notification-personal-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    [userId] = await db('users').insert({ name: 'Notification User', email: `notification-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'student' });
    await db('student_profiles').insert({ student_id: userId, personal_id: personalId });
    await acceptCurrentWaiver(db, userId);
    token = jwt.sign({ id: userId, role: 'student', sessionVersion: 0, csrf: 'notification-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (userId) await db('users').where({ id: userId }).del();
    if (personalId) await db('users').where({ id: personalId }).del();
    await db.destroy();
  });

  test('updates preferences and keeps invalid channels out', async () => {
    const invalid = await request(app).put('/api/notifications/preferences').set('Authorization', `Bearer ${token}`).send({ preferences: [{ eventType: 'system', channel: 'sms', enabled: true }] });
    expect(invalid.statusCode).toBe(400);
    const updated = await request(app).put('/api/notifications/preferences').set('Authorization', `Bearer ${token}`).send({ preferences: [{ eventType: 'system', channel: 'in_app', enabled: true }, { eventType: 'system', channel: 'email', enabled: false }] });
    expect(updated.statusCode).toBe(200);
    expect(updated.body).toEqual(expect.arrayContaining([{ eventType: 'system', channel: 'in_app', enabled: true }, { eventType: 'system', channel: 'email', enabled: false }]));
  });

  test('enqueues in-app notifications with deduplication and reads them', async () => {
    const first = await enqueueNotification({ userId, eventType: 'system', title: 'Aviso', body: 'Mensagem', dedupeKey: 'notice-1' });
    const second = await enqueueNotification({ userId, eventType: 'system', title: 'Aviso', body: 'Mensagem', dedupeKey: 'notice-1' });
    expect(first).toHaveLength(1);
    expect(second).toEqual(first);
    notificationId = first[0];
    const list = await request(app).get('/api/notifications').set('Authorization', `Bearer ${token}`);
    expect(list.statusCode).toBe(200);
    expect(list.body).toMatchObject({ unreadCount: 1 });
    expect(list.body.items[0]).toMatchObject({ id: notificationId, channel: 'in_app', status: 'unread' });
    expect(list.body.items[0].deliveryStatus).toBe('pending');
  });

  test('marks only the owner notification as read', async () => {
    const marked = await request(app).patch(`/api/notifications/${notificationId}/read`).set('Authorization', `Bearer ${token}`).send({});
    expect(marked.statusCode).toBe(200);
    const repeated = await request(app).patch(`/api/notifications/${notificationId}/read`).set('Authorization', `Bearer ${token}`).send({});
    expect(repeated.statusCode).toBe(404);
  });
});
