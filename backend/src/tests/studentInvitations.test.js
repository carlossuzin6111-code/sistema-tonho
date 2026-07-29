process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../index');
const db = require('../database');

const tokenFor = user => jwt.sign({ id: user.id, role: user.role, sessionVersion: 0 }, process.env.JWT_SECRET);

describe('SEC-03 student invitations', () => {
  let personal;
  let token;

  beforeAll(async () => {
    await db.ready;
    await db('student_invitations').del();
    await db('student_profiles').del();
    await db('users').del();
    const [id] = await db('users').insert({ name: 'Invite Personal', email: 'invite-personal@test.com', password_hash: 'hash', role: 'personal' });
    personal = { id, role: 'personal' };
    token = tokenFor(personal);
  });

  afterAll(async () => db.destroy());

  test('creates a hashed, expiring invitation for the authenticated personal', async () => {
    const response = await request(app)
      .post('/api/personal/students/invite')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: ' New.Student@Test.COM ' });

    expect(response.statusCode).toBe(201);
    expect(response.body.token).toHaveLength(43);
    const row = await db('student_invitations').where({ id: response.body.invitationId }).first();
    expect(row.personal_id).toBe(personal.id);
    expect(row.token_hash).not.toBe(response.body.token);
    expect(new Date(row.expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('replaces an unclaimed invitation for the same personal and email', async () => {
    const first = await request(app).post('/api/personal/students/invite').set('Authorization', `Bearer ${token}`).send({ email: 'repeat@test.com' });
    const second = await request(app).post('/api/personal/students/invite').set('Authorization', `Bearer ${token}`).send({ email: 'repeat@test.com' });
    expect(second.statusCode).toBe(201);
    expect(await db('student_invitations').where({ email: 'repeat@test.com' })).toHaveLength(1);
    expect(first.body.token).not.toBe(second.body.token);
  });

  test('rejects invitations for an already registered email', async () => {
    const response = await request(app).post('/api/personal/students/invite').set('Authorization', `Bearer ${token}`).send({ email: 'invite-personal@test.com' });
    expect(response.statusCode).toBe(400);
    expect(response.body.error).toBe('Email already registered');
  });
});
