process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const bcrypt = require('bcryptjs');
const request = require('supertest');
const app = require('../index');
const db = require('../database');
const { CSRF_COOKIE, SESSION_COOKIE } = require('../services/sessionService');

function cookieValue(response, name) {
  const cookie = (response.headers['set-cookie'] || []).find(value => value.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.split(';', 1)[0].slice(name.length + 1)) : '';
}

function cookieHeader(response) {
  return (response.headers['set-cookie'] || []).map(cookie => cookie.split(';', 1)[0]).join('; ');
}

describe('SEC-02 — compulsory password change onboarding', () => {
  let studentId;
  let studentEmail;
  const password = 'TemporaryPassword123!';

  beforeAll(async () => {
    await db.ready;
  });

  beforeEach(async () => {
    const passwordHash = await bcrypt.hash(password, 10);
    studentEmail = `onboarding-${Date.now()}-${Math.random().toString(16).slice(2)}@example.com`;
    [studentId] = await db('users').insert({
      name: 'Onboarding Student',
      email: studentEmail,
      password_hash: passwordHash,
      role: 'student',
      must_change_password: true,
      session_version: 0
    });
  });

  afterEach(async () => {
    await db('users').where({ id: studentId }).del();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test('login reports the mandatory change and blocks protected routes', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: studentEmail, password });

    expect(login.statusCode).toBe(200);
    expect(login.body.user.mustChangePassword).toBe(true);

    const blocked = await request(app)
      .get('/api/student/workouts')
      .set('Cookie', cookieHeader(login));

    expect(blocked.statusCode).toBe(428);
    expect(blocked.body.code).toBe('PASSWORD_CHANGE_REQUIRED');
  });

  test('allows only password update, clears the flag and issues a fresh session', async () => {
    const login = await request(app).post('/api/auth/login').send({ email: studentEmail, password });
    const csrf = cookieValue(login, CSRF_COOKIE);

    const changed = await request(app)
      .put('/api/profile/password')
      .set('Cookie', cookieHeader(login))
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: password, newPassword: 'PermanentPassword123!' });

    expect(changed.statusCode).toBe(200);
    expect((await db('users').where({ id: studentId }).first()).must_change_password).toBe(0);

    const me = await request(app)
      .get('/api/auth/me')
      .set('Cookie', cookieHeader(changed));

    expect(me.statusCode).toBe(200);
    expect(me.body.mustChangePassword).toBe(false);
    expect(cookieValue(changed, SESSION_COOKIE)).not.toBe('');
  });
});
