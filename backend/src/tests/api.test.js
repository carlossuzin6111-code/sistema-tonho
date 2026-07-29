process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../index');
const db = require('../database');
const http = require('http');
const { hashAccessKey, issueAccessKey } = require('../services/accessKeyService');
const {
  CSRF_COOKIE,
  JWT_SECRET,
  SESSION_COOKIE
} = require('../services/sessionService');

const testAccessKey = 'key_for_testing';

let server;
let testAccessKeyId;

function setCookies(response) {
  return response.headers['set-cookie'] || [];
}

function cookieValue(response, name) {
  const cookie = setCookies(response).find(value => value.startsWith(`${name}=`));
  if (!cookie) return '';
  return decodeURIComponent(cookie.split(';', 1)[0].slice(name.length + 1));
}

function cookieHeader(response) {
  return setCookies(response)
    .map(cookie => cookie.split(';', 1)[0])
    .join('; ');
}

async function insertAccessKey(accessKey) {
  const [id] = await db('registration_keys').insert({
    key_hash: hashAccessKey(accessKey),
    expires_at: db.raw("datetime('now', '+7 days')")
  });
  return id;
}

beforeAll(async () => {
  await db.ready;
  testAccessKeyId = await insertAccessKey(testAccessKey);

  // Let the operating system select a free port for SSE tests.
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
});

afterAll(async () => {
  // Close the temporary server
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }

  // Close Knex connection to prevent leaks
  await db.destroy();
});

describe('FitLife Sync API Integration Tests', () => {
  let personalToken = '';
  let studentToken = '';
  let personalCookies = '';
  let studentCookies = '';
  let personalCsrf = '';
  let studentCsrf = '';
  let studentId = null;
  let otherPersonalToken = '';
  let otherPersonalId = null;
  let otherStudentToken = '';
  let otherStudentId = null;
  let partnerToken = '';
  let partnerProfileId = null;
  let workoutId = null;
  let exerciseId = null;
  let workoutExerciseId = null;

  describe('HTTP Security', () => {
    test('Should report API and database readiness', async () => {
      const res = await request(app).get('/api/health');

      expect(res.statusCode).toBe(200);
      expect(res.body).toEqual({ status: 'ok' });
    });

    test('Should apply headers and omit CORS for an untrusted origin', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Origin', 'https://untrusted.example');

      expect(res.statusCode).toBe(401);
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['permissions-policy']).toBe('camera=(), microphone=(), geolocation=()');
      expect(res.headers['access-control-allow-origin']).toBeUndefined();
      expect(res.headers['x-powered-by']).toBeUndefined();
    });
  });

  // ==========================================
  // 1. AUTENTICAÇÃO
  // ==========================================
  describe('Autenticação Endpoints', () => {
    test('Should fail registration when accessKey is missing', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Personal',
          email: 'test_personal@fitlife.com',
          password: 'password123'
        });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Name, email, password, and accessKey are required');
    });

    test('Should fail registration when accessKey is invalid', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Personal',
          email: 'test_personal@fitlife.com',
          password: 'password123',
          accessKey: 'wrong_key'
        });
      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error', 'Access Key Inválida');
    });

    test('Should reject new passwords shorter than 10 characters without consuming the key', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Short Password Personal',
          email: 'short-password@fitlife.com',
          password: 'short123',
          accessKey: testAccessKey
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toMatchObject({
        error: 'Invalid request data',
        details: [{ field: 'password', message: 'password must have at least 10 characters' }]
      });
      const storedKey = await db('registration_keys').where({ id: testAccessKeyId }).first();
      expect(storedKey.used_at).toBeNull();
    });

    test('Should register successfully with a valid accessKey', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Personal',
          email: '  Test_Personal@FitLife.COM  ',
          password: 'password123',
          accessKey: testAccessKey
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Personal Trainer registered successfully');
      expect(res.body).not.toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'test_personal@fitlife.com');
      expect(res.body.user).toHaveProperty('role', 'personal');

      const storedKey = await db('registration_keys').where({ id: testAccessKeyId }).first();
      expect(storedKey.key_hash).toBe(hashAccessKey(testAccessKey));
      expect(storedKey.key_hash).not.toContain(testAccessKey);
      expect(storedKey.used_at).not.toBeNull();
      expect(storedKey.used_by).toBe(res.body.user.id);
    });

    test('Should not consume an access key when the email is already registered', async () => {
      const accessKey = 'duplicate_email_key_for_testing';
      const accessKeyId = await insertAccessKey(accessKey);

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Duplicate Personal',
          email: '  TEST_PERSONAL@FITLIFE.COM ',
          password: 'password123',
          accessKey
        });

      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Email already registered');
      const storedKey = await db('registration_keys').where({ id: accessKeyId }).first();
      expect(storedKey.used_at).toBeNull();
      expect(storedKey.used_by).toBeNull();
    });

    test('Should allow only one registration when the same key is submitted concurrently', async () => {
      const accessKey = 'concurrent_key_for_testing';
      const accessKeyId = await insertAccessKey(accessKey);

      const responses = await Promise.all([
        request(app).post('/api/auth/register').send({
          name: 'Concurrent Personal A',
          email: 'concurrent-a@fitlife.com',
          password: 'password123',
          accessKey
        }),
        request(app).post('/api/auth/register').send({
          name: 'Concurrent Personal B',
          email: 'concurrent-b@fitlife.com',
          password: 'password123',
          accessKey
        })
      ]);

      expect(responses.map(response => response.statusCode).sort()).toEqual([201, 403]);

      const createdUsers = await db('users')
        .select('id')
        .whereIn('email', ['concurrent-a@fitlife.com', 'concurrent-b@fitlife.com']);
      expect(createdUsers).toHaveLength(1);

      const storedKey = await db('registration_keys').where({ id: accessKeyId }).first();
      expect(storedKey.used_at).not.toBeNull();
      expect(storedKey.used_by).toBe(createdUsers[0].id);
    });

    test('Should fail login with incorrect password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_personal@fitlife.com',
          password: 'wrong_password'
        });
      expect(res.statusCode).toBe(400);
      expect(res.body).toHaveProperty('error', 'Invalid email or password');
    });

    test('Should login successfully with correct credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: ' TEST_PERSONAL@FITLIFE.COM ',
          password: 'password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(res.body).not.toHaveProperty('token');
      personalToken = cookieValue(res, SESSION_COOKIE);
      personalCsrf = cookieValue(res, CSRF_COOKIE);
      personalCookies = cookieHeader(res);
      expect(personalToken).toBeTruthy();
      expect(personalCsrf).toBeTruthy();
      expect(setCookies(res).find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))).toContain('HttpOnly');
      expect(setCookies(res).find(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))).toContain('SameSite=Strict');
    });

    test('Should retrieve authenticated user details using token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('email', 'test_personal@fitlife.com');
      expect(res.body).toHaveProperty('role', 'personal');
    });

    test('Should authenticate browser requests using the HttpOnly cookie', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Cookie', personalCookies);

      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('email', 'test_personal@fitlife.com');
    });

    test('Should reject cookie mutations without the matching CSRF token', async () => {
      const missing = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', personalCookies);
      expect(missing.statusCode).toBe(403);
      expect(missing.body).toHaveProperty('error', 'Invalid CSRF token');

      const wrong = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', personalCookies)
        .set('X-CSRF-Token', 'wrong-token');
      expect(wrong.statusCode).toBe(403);
    });

    test('Should reject cookie mutations from an untrusted origin', async () => {
      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', personalCookies)
        .set('Origin', 'https://untrusted.example')
        .set('X-CSRF-Token', personalCsrf);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toBe('Untrusted request origin');
    });

    test('Should clear session cookies on logout with valid CSRF', async () => {
      const login = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test_personal@fitlife.com', password: 'password123' });
      const cookies = cookieHeader(login);
      const csrf = cookieValue(login, CSRF_COOKIE);

      const res = await request(app)
        .post('/api/auth/logout')
        .set('Cookie', cookies)
        .set('X-CSRF-Token', csrf);

      expect(res.statusCode).toBe(200);
      expect(res.headers['clear-site-data']).toBe('"cache", "cookies"');
      const cleared = setCookies(res);
      expect(cleared.filter(cookie => cookie.includes('Max-Age=0'))).toHaveLength(2);
    });

    test('Should reject expired session cookies and ignore query-string tokens', async () => {
      const expiredToken = jwt.sign(
        { id: 1, role: 'personal', csrf: 'expired-csrf' },
        JWT_SECRET,
        { expiresIn: -1 }
      );
      const expired = await request(app)
        .get('/api/auth/me')
        .set('Cookie', `${SESSION_COOKIE}=${expiredToken}`);
      expect(expired.statusCode).toBe(403);

      const queryToken = await request(app)
        .get(`/api/auth/me?token=${encodeURIComponent(personalToken)}`);
      expect(queryToken.statusCode).toBe(401);
    });

    test('Should fail profile fetch when token is missing', async () => {
      const res = await request(app)
        .get('/api/auth/me');
      expect(res.statusCode).toBe(401);
      expect(res.body).toHaveProperty('error', 'Access token required');
    });
  });

  // ==========================================
  // 2. ALUNOS
  // ==========================================
  describe('Alunos Endpoints', () => {
    test('Should fail to create a Student if requester is not a Personal Trainer', async () => {
      const res = await request(app)
        .post('/api/personal/students')
        .send({
          name: 'Test Student',
          email: 'test_student@fitlife.com',
          password: 'student_password123'
        });
      expect(res.statusCode).toBe(401); // missing token
    });

    test('Should reject a Student password shorter than 10 characters', async () => {
      const res = await request(app)
        .post('/api/personal/students')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          name: 'Short Password Student',
          email: 'short-student@fitlife.com',
          password: 'short123'
        });

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toContainEqual({
        field: 'password',
        message: 'password must have at least 10 characters'
      });
    });

    test('Should create a new Student successfully (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/personal/students')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          name: 'Test Student',
          email: ' Test_Student@FitLife.COM ',
          password: 'student_password123',
          height: 1.75,
          targetWeight: 75.0,
          birthDate: '1998-05-20'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Student account created successfully');
      expect(res.body.student).toHaveProperty('email', 'test_student@fitlife.com');
      studentId = res.body.student.id;
    });

    test('Should login successfully as the created Student', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_student@fitlife.com',
          password: 'student_password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).not.toHaveProperty('token');
      studentToken = cookieValue(res, SESSION_COOKIE);
      studentCsrf = cookieValue(res, CSRF_COOKIE);
      studentCookies = cookieHeader(res);
      expect(studentToken).toBeTruthy();
      expect(studentCsrf).toBeTruthy();
    });

    test('Should require and complete the initial password change', async () => {
      const blocked = await request(app)
        .get('/api/student/workouts')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(blocked.statusCode).toBe(428);
      expect(blocked.body).toMatchObject({ code: 'PASSWORD_CHANGE_REQUIRED' });

      const changed = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Cookie', studentCookies)
        .set('X-CSRF-Token', studentCsrf)
        .send({ currentPassword: 'student_password123', newPassword: 'new_student_password123' });
      expect(changed.statusCode).toBe(200);

      const refreshedSession = setCookies(changed)
        .filter(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))
        .pop();
      studentToken = refreshedSession
        ? decodeURIComponent(refreshedSession.split(';', 1)[0].slice(`${SESSION_COOKIE}=`.length))
        : '';
      studentCsrf = cookieValue(changed, CSRF_COOKIE);
      studentCookies = cookieHeader(changed);
      expect(studentToken).toBeTruthy();
      expect(studentCsrf).toBeTruthy();
    });

    test('Should retrieve list of students linked to Personal Trainer', async () => {
      const res = await request(app)
        .get('/api/personal/students')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('email', 'test_student@fitlife.com');
      expect(res.body[0]).toMatchObject({ hasAvatar: false, avatarUpdatedAt: null });
      expect(res.body[0]).not.toHaveProperty('avatar_filename');
    });

    test('Should return weekly adherence ordered by lowest percentage first', async () => {
      const res = await request(app)
        .get('/api/personal/students/adherence')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('students');
      expect(Array.isArray(res.body.students)).toBe(true);
      expect(res.body.students[0]).toEqual(expect.objectContaining({ studentId: expect.any(Number), adherence: expect.any(Number) }));
    });

    test('Should update the linked student lifecycle statuses', async () => {
      const paused = await request(app)
        .patch(`/api/personal/students/${studentId}/status`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ accountStatus: 'suspended', relationshipStatus: 'paused' });
      expect(paused.statusCode).toBe(200);
      expect(paused.body).toMatchObject({ account_status: 'suspended', relationship_status: 'paused' });

      const restored = await request(app)
        .patch(`/api/personal/students/${studentId}/status`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ accountStatus: 'active', relationshipStatus: 'active' });
      expect(restored.statusCode).toBe(200);
    });

    test('Should keep personal assessment notes private from the student', async () => {
      const created = await request(app)
        .post(`/api/personal/students/${studentId}/assessments`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ experienceLevel: 'intermediate', clinicalInjuries: 'Joelho esquerdo', personalNotes: 'Acompanhar com cuidado', studentNotes: 'Evitar impacto no início' });
      expect(created.statusCode).toBe(201);
      expect(created.body.personal_notes).toBe('Acompanhar com cuidado');

      const studentView = await request(app)
        .get(`/api/personal/students/${studentId}/assessments`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentView.statusCode).toBe(200);
      expect(studentView.body[0]).toMatchObject({ experience_level: 'intermediate', student_notes: 'Evitar impacto no início' });
      expect(studentView.body[0]).not.toHaveProperty('personal_notes');
    });

    test('Should get student details (Personal Trainer)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('student');
      expect(res.body.student).toHaveProperty('email', 'test_student@fitlife.com');
      expect(res.body.student).toMatchObject({ hasAvatar: false, avatarUpdatedAt: null });
      expect(res.body.student).not.toHaveProperty('avatar_filename');
    });

    test('Should get own student details (Student)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('student');
    });

    test('Should fail to get other student details (Student)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/9999`) // invalid student ID
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(403);
    });

    test('Should reset student password (Personal Trainer)', async () => {
      const res = await request(app)
        .post(`/api/personal/students/${studentId}/reset-password`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          newPassword: 'new_student_password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Senha redefinida com sucesso');

      const revokedSession = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(revokedSession.statusCode).toBe(403);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test_student@fitlife.com',
          password: 'new_student_password123'
        });
      expect(newLogin.statusCode).toBe(200);
      studentToken = cookieValue(newLogin, SESSION_COOKIE);
      studentCsrf = cookieValue(newLogin, CSRF_COOKIE);
      studentCookies = cookieHeader(newLogin);

      const mandatoryChange = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('Cookie', studentCookies)
        .set('X-CSRF-Token', studentCsrf)
        .send({ currentPassword: 'new_student_password123', newPassword: 'replacement-password123' });
      expect(mandatoryChange.statusCode).toBe(200);
      const refreshedSession = setCookies(mandatoryChange)
        .filter(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))
        .pop();
      studentToken = refreshedSession
        ? decodeURIComponent(refreshedSession.split(';', 1)[0].slice(`${SESSION_COOKIE}=`.length))
        : '';
      studentCsrf = cookieValue(mandatoryChange, CSRF_COOKIE);
      studentCookies = cookieHeader(mandatoryChange);
    });

    test('Should reject resetting a student password to fewer than 10 characters', async () => {
      const res = await request(app)
        .post(`/api/personal/students/${studentId}/reset-password`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ newPassword: 'short123' });

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toContainEqual({
        field: 'newPassword',
        message: 'newPassword must have at least 10 characters'
      });
    });
  });

  // ==========================================
  // 3. MEDIDAS
  // ==========================================
  describe('Medidas Endpoints', () => {
    test('Should record physical measurements (Student)', async () => {
      const res = await request(app)
        .post('/api/student/measurements')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          weight: 73.5,
          chest: 96.0,
          waist: 81.0,
          hips: 99.0
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Measurements recorded successfully');
    });

    test('Should get measurements history (Student)', async () => {
      const res = await request(app)
        .get('/api/student/measurements')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('weight', 73.5);
    });

    test('Should record physical measurements for student (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/student/measurements')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          studentId,
          weight: 74.0,
          chest: 97.0
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Measurements recorded successfully');
    });

    test('Should get measurements history for student (Personal Trainer)', async () => {
      const res = await request(app)
        .get(`/api/student/measurements?studentId=${studentId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(1);
    });
  });

  // ==========================================
  // 4. CATÁLOGO DE EXERCÍCIOS
  // ==========================================
  describe('Catálogo de Exercícios Endpoints', () => {
    test('Should create an exercise in the global catalog (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/catalog/exercises')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          name: 'Flexão de Braço',
          gifUrl: 'https://raw.githubusercontent.com/fitlife/exercises/flexao.gif',
          description: 'Mantenha o corpo reto, desça flexionando os braços...'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Exercise created successfully');
      expect(res.body.exercise).toHaveProperty('name', 'Flexão de Braço');
      exerciseId = res.body.exercise.id;
    });

    test('Should retrieve exercises catalog list', async () => {
      const res = await request(app)
        .get('/api/catalog/exercises')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });
  });

  // ==========================================
  // 5. TREINOS
  // ==========================================
  describe('Treinos Endpoints', () => {
    test('Should create a workout session for student (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/workouts')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          studentId,
          name: 'Treino A - Adaptativo',
          description: 'Treino inicial de adaptação muscular'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Workout created successfully');
      expect(res.body).toHaveProperty('workoutId');
      workoutId = res.body.workoutId;
    });

    test('Should hide draft workouts from students and publish them explicitly', async () => {
      const draft = await request(app)
        .patch(`/api/workouts/${workoutId}/status`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ status: 'draft' });
      expect(draft.statusCode).toBe(200);
      expect(draft.body.status).toBe('draft');

      const hidden = await request(app)
        .get('/api/student/workouts')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(hidden.body.some(workout => workout.id === workoutId)).toBe(false);

      const published = await request(app)
        .patch(`/api/workouts/${workoutId}/status`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ status: 'published' });
      expect(published.statusCode).toBe(200);

    });

    test('Should add exercise to the created workout (Personal Trainer)', async () => {
      const res = await request(app)
        .post(`/api/workouts/${workoutId}/exercises`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          exerciseId,
          name: 'Flexão de Braço',
          sets: 3,
          reps: '12',
          weight: 'Corporal',
          restTime: '60s',
          notes: 'Manter abdômen contraído'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Exercise added successfully');
      expect(res.body).toHaveProperty('exerciseId');
      workoutExerciseId = res.body.exerciseId;
    });

    test('Should retrieve workouts list (Student)', async () => {
      const res = await request(app)
        .get('/api/student/workouts')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('name', 'Treino A - Adaptativo');
      expect(res.body[0].exercises.length).toBeGreaterThan(0);
    });

    test('Should replace and read an ondulatory periodization plan', async () => {
      const plan = [
        { weekNumber: 1, label: 'Acúmulo', intensityPercent: 70, volumeMultiplier: 1.2, notes: 'Técnica e volume' },
        { weekNumber: 2, label: 'Intensificação', intensityPercent: 82.5, volumeMultiplier: 0.9 },
        { weekNumber: 3, label: 'Deload', intensityPercent: 60, volumeMultiplier: 0.6 }
      ];
      const saved = await request(app)
        .put(`/api/workouts/${workoutId}/periodization`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ microcycles: plan });
      expect(saved.statusCode).toBe(200);
      expect(saved.body.microcycles).toHaveLength(3);
      expect(saved.body.microcycles[1]).toEqual(expect.objectContaining({ week_number: 2, intensity_percent: 82.5 }));

      const readAsStudent = await request(app)
        .get(`/api/workouts/${workoutId}/periodization`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(readAsStudent.statusCode).toBe(200);
      expect(readAsStudent.body.microcycles.map(item => item.label)).toEqual(['Acúmulo', 'Intensificação', 'Deload']);
    });

    test('Should reject invalid or non-sequential microcycles', async () => {
      const res = await request(app)
        .put(`/api/workouts/${workoutId}/periodization`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ microcycles: [{ weekNumber: 2, label: 'Inválido', intensityPercent: 300, volumeMultiplier: 0 }] });
      expect(res.statusCode).toBe(400);
    });

    test('Should return progression volume and latest exercise suggestion', async () => {
      const res = await request(app)
        .get('/api/student/progression')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('studentId', studentId);
      expect(Array.isArray(res.body.exercises)).toBe(true);
      if (res.body.exercises.length) expect(res.body.exercises[0]).toEqual(expect.objectContaining({ exerciseName: expect.any(String), totalVolume: expect.any(Number) }));
    });

    test('Should archive the previous published workout when replacing it', async () => {
      const replacement = await request(app)
        .post('/api/workouts')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ studentId, name: 'Treino B - Publicado' });
      expect(replacement.statusCode).toBe(201);
      const published = await request(app)
        .patch(`/api/workouts/${replacement.body.workoutId}/status`)
        .set('Authorization', `Bearer ${personalToken}`)
        .send({ status: 'published' });
      expect(published.statusCode).toBe(200);
      await expect(db('workouts').where({ id: workoutId }).select('status').first()).resolves.toMatchObject({ status: 'archived' });
    });

    test('Should remove exercise from workout (Personal Trainer)', async () => {
      const res = await request(app)
        .delete(`/api/exercises/${workoutExerciseId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Exercise deleted successfully');
    });

    test('Should remove workout session (Personal Trainer)', async () => {
      const res = await request(app)
        .delete(`/api/workouts/${workoutId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Workout deleted successfully');
    });

    test('Should remove exercise from global catalog (Personal Trainer)', async () => {
      const res = await request(app)
        .delete(`/api/catalog/exercises/${exerciseId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Exercise deleted successfully');
    });
  });

  describe('Audit Log Endpoint', () => {
    test('Should return only the authenticated user audit trail without sensitive values', async () => {
      const personalResponse = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(personalResponse.statusCode).toBe(200);
      const actions = personalResponse.body.map(log => log.action);
      expect(actions).toEqual(expect.arrayContaining([
        'student.password_reset',
        'measurement.created',
        'workout_exercise.deleted',
        'workout.deleted',
        'catalog_exercise.deleted'
      ]));
      expect(JSON.stringify(personalResponse.body)).not.toMatch(/new_student_password123|73\.5|74(?:\.0)?/);

      const studentResponse = await request(app)
        .get('/api/audit-logs')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(studentResponse.statusCode).toBe(200);
      expect(studentResponse.body.map(log => log.action)).toEqual(expect.arrayContaining(['measurement.created']));
    });

    test('Should reject unauthenticated audit access', async () => {
      await request(app).get('/api/audit-logs').expect(401);
    });
  });

  // ==========================================
  // 6. CHAT
  // ==========================================
  describe('Chat Endpoints', () => {
    beforeAll(async () => {
      const otherAccessKey = await issueAccessKey(db);
      const personalRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Other Personal',
          email: 'other_personal@fitlife.com',
          password: 'password123',
          accessKey: otherAccessKey
        });
      expect(personalRes.statusCode).toBe(201);
      otherPersonalToken = cookieValue(personalRes, SESSION_COOKIE);
      otherPersonalId = personalRes.body.user.id;

      const studentRes = await request(app)
        .post('/api/personal/students')
        .set('Authorization', `Bearer ${otherPersonalToken}`)
        .send({
          name: 'Other Student',
          email: 'other_student@fitlife.com',
          password: 'student_password123'
        });
      expect(studentRes.statusCode).toBe(201);
      otherStudentId = studentRes.body.student.id;

      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'other_student@fitlife.com',
          password: 'student_password123'
        });
      expect(loginRes.statusCode).toBe(200);
      otherStudentToken = cookieValue(loginRes, SESSION_COOKIE);
      const otherStudentCookies = cookieHeader(loginRes);
      const otherStudentCsrf = cookieValue(loginRes, CSRF_COOKIE);
      const mandatoryChange = await request(app)
        .put('/api/profile/password')
        .set('Cookie', otherStudentCookies)
        .set('X-CSRF-Token', otherStudentCsrf)
        .send({ currentPassword: 'student_password123', newPassword: 'other_student_password123' });
      expect(mandatoryChange.statusCode).toBe(200);
      const refreshedSession = setCookies(mandatoryChange)
        .filter(cookie => cookie.startsWith(`${SESSION_COOKIE}=`))
        .pop();
      otherStudentToken = refreshedSession
        ? decodeURIComponent(refreshedSession.split(';', 1)[0].slice(`${SESSION_COOKIE}=`.length))
        : '';

      const [partnerUserId] = await db('users').insert({ name: 'Partner Clinico', email: 'partner@fitlife.com', password_hash: 'not-used', role: 'partner' });
      [partnerProfileId] = await db('professional_partners').insert({ user_id: partnerUserId, specialty: 'Fisioterapia', organization: 'Clinica Fit' });
      partnerToken = jwt.sign({ id: partnerUserId, role: 'partner', sessionVersion: 0, csrf: 'partner-csrf' }, JWT_SECRET, { expiresIn: '1h' });
    });

    test('Should enforce explicit partner consent for read-only student data', async () => {
      const denied = await request(app)
        .get(`/api/partner/students/${studentId}/summary`)
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(denied.statusCode).toBe(403);

      const consent = await request(app)
        .post('/api/student/partner-consents')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ partnerId: partnerProfileId, scopes: ['measurements'] });
      expect(consent.statusCode).toBe(201);

      const allowed = await request(app)
        .get(`/api/partner/students/${studentId}/summary`)
        .set('Authorization', `Bearer ${partnerToken}`);
      expect(allowed.statusCode).toBe(200);
      expect(allowed.body.scopes).toEqual(['measurements']);
      expect(Array.isArray(allowed.body.measurements)).toBe(true);

      const revoked = await request(app)
        .delete(`/api/student/partner-consents/${consent.body.consentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(revoked.statusCode).toBe(200);
    });

    test('Should send chat message (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          receiverId: studentId,
          message: 'Olá, aluno! Pronto para o treino de hoje?'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Olá, aluno! Pronto para o treino de hoje?');
      expect(res.body).toHaveProperty('sender_id');
    });

    test('Should send chat message (Student)', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({
          message: 'Olá, Personal! Sim, tudo pronto.'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Olá, Personal! Sim, tudo pronto.');
    });

    test('Should trim chat messages and reject content above the storage limit', async () => {
      const trimmed = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ message: '  mensagem com espaços  ' });
      expect(trimmed.statusCode).toBe(201);
      expect(trimmed.body.message).toBe('mensagem com espaços');

      const oversizedMessage = 'x'.repeat(2001);
      const oversized = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ message: oversizedMessage });
      expect(oversized.statusCode).toBe(400);
      expect(oversized.body).toMatchObject({
        error: 'Invalid request data',
        details: [{ field: 'message', message: 'message must have at most 2000 characters' }]
      });
      expect(await db('chat_messages').where({ message: oversizedMessage }).first()).toBeUndefined();
    });

    test('Should retrieve chat history for target user (Personal Trainer)', async () => {
      const res = await request(app)
        .get(`/api/chat/${studentId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(1);
    });

    test('Should retrieve own chat history (Student)', async () => {
      const res = await request(app)
        .get('/api/chat')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    test('Should paginate chat history with a bounded cursor window', async () => {
      const first = await request(app)
        .get(`/api/chat/${studentId}?limit=2`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(first.statusCode).toBe(200);
      expect(first.body).toEqual(expect.objectContaining({ messages: expect.any(Array), nextCursor: expect.anything() }));
      expect(first.body.messages).toHaveLength(2);
      expect(first.body.messages[0].id).toBeLessThan(first.body.messages[1].id);

      const older = await request(app)
        .get(`/api/chat/${studentId}?before=${first.body.nextCursor}&limit=2`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(older.statusCode).toBe(200);
      expect(older.body).toHaveProperty('messages');
      expect(older.body.messages.every(message => message.id < Number(first.body.nextCursor))).toBe(true);
    });

    test('Should reject invalid chat pagination parameters', async () => {
      const res = await request(app)
        .get(`/api/chat/${studentId}?limit=51`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(400);
      expect(res.body.error).toMatch(/limit/);
    });

    test('Should expose only the linked Personal Trainer public avatar metadata to a Student', async () => {
      const res = await request(app)
        .get('/api/chat/partner')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ id: expect.any(Number), name: 'Test Personal', hasAvatar: false, avatarUpdatedAt: null });
      expect(res.body).not.toHaveProperty('avatar_filename');
    });

    test('Should deny the Student chat partner helper to a Personal Trainer', async () => {
      const res = await request(app)
        .get('/api/chat/partner')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(403);
    });

    test('Should deny a Personal Trainer access to another trainer student messages', async () => {
      const personal = await db('users')
        .select('id')
        .where('email', 'test_personal@fitlife.com')
        .first();
      const [messageId] = await db('chat_messages').insert({
        sender_id: otherStudentId,
        receiver_id: personal.id,
        message: 'Cross-tenant unread fixture',
        read_status: 0
      });

      const res = await request(app)
        .get(`/api/chat/${otherStudentId}`)
        .set('Authorization', `Bearer ${personalToken}`);

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error', 'Chat access forbidden');

      const message = await db('chat_messages').where('id', messageId).first();
      expect(message.read_status).toBe(0);
    });

    test('Should deny a Personal Trainer sending messages to another trainer student', async () => {
      const unauthorizedMessage = 'Cross-tenant message must not be stored';
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          receiverId: otherStudentId,
          message: unauthorizedMessage
        });

      expect(res.statusCode).toBe(403);
      expect(res.body).toHaveProperty('error', 'Chat access forbidden');

      const message = await db('chat_messages')
        .where('message', unauthorizedMessage)
        .first();
      expect(message).toBeUndefined();
    });

    test('Should ignore a Student supplied receiver and use the linked Personal Trainer', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${otherStudentToken}`)
        .send({
          receiverId: otherPersonalId + 1000,
          message: 'Message for linked trainer only'
        });

      expect(res.statusCode).toBe(201);
      expect(res.body.receiver_id).toBe(otherPersonalId);
    });

    test('Should open real-time SSE chat connection', (done) => {
      http.get({
        hostname: '127.0.0.1',
        port: server.address().port,
        path: '/api/chat/stream',
        headers: {
          'Cookie': studentCookies
        }
      }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        expect(res.headers['cache-control']).toBe('no-cache');
        expect(res.headers['connection']).toBe('keep-alive');
        res.destroy(); // Close the connection
        setTimeout(done, 50);
      });
    });
  });

  describe('Own profile endpoints', () => {
    async function createAvatarDataUrl() {
      const avatarBytes = await require('sharp')({
        create: { width: 8, height: 8, channels: 3, background: '#336699' }
      }).png().toBuffer();
      return `data:image/png;base64,${avatarBytes.toString('base64')}`;
    }

    test('Should update and normalize only the authenticated user name', async () => {
      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: '  Student   Updated  ' });

      expect(res.statusCode).toBe(200);
      expect(res.body.user.name).toBe('Student Updated');
      const stored = await db('users').where({ id: studentId }).first();
      expect(stored.name).toBe('Student Updated');
    });

    test('Should reject stale If-Match profile updates with 409', async () => {
      const current = await db('users').select('version').where({ id: studentId }).first();
      const first = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('If-Match', String(current.version))
        .send({ name: 'Versioned Student' });
      expect(first.statusCode).toBe(200);
      expect(first.body.user.version).toBe(current.version + 1);

      const stale = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .set('If-Match', String(current.version))
        .send({ name: 'Stale Update' });
      expect(stale.statusCode).toBe(409);
    });

    test('Should reject unknown profile fields', async () => {
      const res = await request(app)
        .patch('/api/profile')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ name: 'Student Updated', role: 'personal' });

      expect(res.statusCode).toBe(400);
      expect(res.body.details).toContainEqual({ field: 'role', message: 'role is not allowed' });
    });

    test('Should store a normalized private avatar and expose it only to linked users', async () => {
      const avatarDataUrl = await createAvatarDataUrl();
      const upload = await request(app)
        .put('/api/profile/avatar')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ imageDataUrl: avatarDataUrl });

      expect(upload.statusCode).toBe(200);
      expect(upload.body.user.hasAvatar).toBe(true);
      expect(upload.body.user.avatarUpdatedAt).toBeTruthy();

      const own = await request(app)
        .get(`/api/profile/avatar/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(own.statusCode).toBe(200);
      expect(own.headers['content-type']).toContain('image/webp');
      expect(own.headers['x-content-type-options']).toBe('nosniff');

      const linkedPersonal = await request(app)
        .get(`/api/profile/avatar/${studentId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(linkedPersonal.statusCode).toBe(200);

      const unrelated = await request(app)
        .get(`/api/profile/avatar/${studentId}`)
        .set('Authorization', `Bearer ${otherPersonalToken}`);
      expect(unrelated.statusCode).toBe(404);
    });

    test('Should reject unsupported avatar content and remove the current avatar', async () => {
      const invalid = await request(app)
        .put('/api/profile/avatar')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ imageDataUrl: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' });
      expect(invalid.statusCode).toBe(400);

      const avatarDataUrl = await createAvatarDataUrl();
      const mismatched = await request(app)
        .put('/api/profile/avatar')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ imageDataUrl: avatarDataUrl.replace('data:image/png', 'data:image/jpeg') });
      expect(mismatched.statusCode).toBe(400);

      const removed = await request(app)
        .delete('/api/profile/avatar')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(removed.statusCode).toBe(200);

      const profile = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(profile.body.hasAvatar).toBe(false);

      const missing = await request(app)
        .get(`/api/profile/avatar/${studentId}`)
        .set('Authorization', `Bearer ${studentToken}`);
      expect(missing.statusCode).toBe(404);
    });

    test('Should require the current password, revoke the old session and preserve a new session', async () => {
      const wrong = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ currentPassword: 'incorrect-password', newPassword: 'replacement-password123' });
      expect(wrong.statusCode).toBe(400);

      const changed = await request(app)
        .put('/api/profile/password')
        .set('Authorization', `Bearer ${studentToken}`)
        .send({ currentPassword: 'replacement-password123', newPassword: 'final-password123' });
      expect(changed.statusCode).toBe(200);
      const refreshedCookies = cookieHeader(changed);
      expect(refreshedCookies).toContain(SESSION_COOKIE);

      const oldSession = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${studentToken}`);
      expect(oldSession.statusCode).toBe(403);

      const currentSession = await request(app)
        .get('/api/auth/me')
        .set('Cookie', refreshedCookies);
      expect(currentSession.statusCode).toBe(200);

      const oldPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test_student@fitlife.com', password: 'replacement-password123' });
      expect(oldPassword.statusCode).toBe(400);

      const newPassword = await request(app)
        .post('/api/auth/login')
        .send({ email: 'test_student@fitlife.com', password: 'final-password123' });
      expect(newPassword.statusCode).toBe(200);
    });
  });
});
