process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../index');
const db = require('../database');
const { JWT_SECRET } = require('../services/sessionService');

describe('auditable support impersonation', () => {
  let supportId;
  let personalId;
  let supportToken;
  let impersonationToken;
  let impersonationId;

  beforeAll(async () => {
    await db.ready;
    [supportId] = await db('users').insert({ name: 'Support Agent', email: `support-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'support' });
    [personalId] = await db('users').insert({ name: 'Target Personal', email: `target-${Date.now()}@fitlife.com`, password_hash: 'not-used', role: 'personal' });
    supportToken = jwt.sign({ id: supportId, role: 'support', sessionVersion: 0, csrf: 'support-csrf' }, JWT_SECRET, { expiresIn: '1h' });
  });

  afterAll(async () => {
    if (supportId) await db('users').where({ id: supportId }).del();
    if (personalId) await db('users').where({ id: personalId }).del();
    await db.destroy();
  });

  test('requires reason and issues a short-lived target token', async () => {
    const invalid = await request(app).post('/api/support/impersonations').set('Authorization', `Bearer ${supportToken}`).send({ targetUserId: personalId });
    expect(invalid.statusCode).toBe(400);
    const created = await request(app).post('/api/support/impersonations').set('Authorization', `Bearer ${supportToken}`).send({ targetUserId: personalId, reason: 'Investigate reported access issue' });
    expect(created.statusCode).toBe(201);
    expect(created.body).toMatchObject({ targetUserId: personalId });
    impersonationId = created.body.impersonationId;
    impersonationToken = created.body.token;
    const me = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${impersonationToken}`);
    expect(me.statusCode).toBe(200);
    expect(me.body).toMatchObject({ id: personalId, role: 'personal', impersonation: { actorUserId: supportId, eventId: impersonationId } });
  });

  test('lists and revokes only events owned by the support actor', async () => {
    const list = await request(app).get('/api/support/impersonations').set('Authorization', `Bearer ${supportToken}`);
    expect(list.statusCode).toBe(200);
    expect(list.body[0]).toMatchObject({ id: impersonationId, targetUserId: personalId, reason: 'Investigate reported access issue' });
    const revoked = await request(app).post(`/api/support/impersonations/${impersonationId}/revoke`).set('Authorization', `Bearer ${supportToken}`).send({});
    expect(revoked.statusCode).toBe(200);
    const blocked = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${impersonationToken}`);
    expect(blocked.statusCode).toBe(403);
  });

  test('does not allow a normal Personal to impersonate', async () => {
    const personalToken = jwt.sign({ id: personalId, role: 'personal', sessionVersion: 0, csrf: 'personal-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    const denied = await request(app).post('/api/support/impersonations').set('Authorization', `Bearer ${personalToken}`).send({ targetUserId: supportId, reason: 'not allowed' });
    expect(denied.statusCode).toBe(403);
  });
});
