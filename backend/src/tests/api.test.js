process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';
const request = require('supertest');
const app = require('../index');
const db = require('../database');
const fs = require('fs');
const http = require('http');

// Save original fs functions to prevent polluting host files
const originalReadFileSync = fs.readFileSync;
const originalWriteFileSync = fs.writeFileSync;

let server;

beforeAll(async () => {
  // Mock keys_aut.json read/write to avoid consuming actual keys
  fs.readFileSync = jest.fn((filePath, options) => {
    if (filePath.endsWith('keys_aut.json')) {
      return JSON.stringify({ valid_keys: ['key_for_testing'] });
    }
    return originalReadFileSync(filePath, options);
  });
  
  fs.writeFileSync = jest.fn((filePath, data, options) => {
    if (filePath.endsWith('keys_aut.json')) {
      return; // Mock write, do not persist to host filesystem
    }
    return originalWriteFileSync(filePath, data, options);
  });

  await db.ready;

  // Let the operating system select a free port for SSE tests.
  await new Promise((resolve, reject) => {
    server = app.listen(0, '127.0.0.1', resolve);
    server.once('error', reject);
  });
});

afterAll(async () => {
  // Restore original fs functions
  fs.readFileSync = originalReadFileSync;
  fs.writeFileSync = originalWriteFileSync;
  
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
  let studentId = null;
  let otherPersonalToken = '';
  let otherPersonalId = null;
  let otherStudentToken = '';
  let otherStudentId = null;
  let workoutId = null;
  let exerciseId = null;
  let workoutExerciseId = null;

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

    test('Should register successfully with a valid accessKey', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Test Personal',
          email: 'test_personal@fitlife.com',
          password: 'password123',
          accessKey: 'key_for_testing'
        });
      expect(res.statusCode).toBe(201);
      expect(res.body).toHaveProperty('message', 'Personal Trainer registered successfully');
      expect(res.body).toHaveProperty('token');
      expect(res.body.user).toHaveProperty('email', 'test_personal@fitlife.com');
      expect(res.body.user).toHaveProperty('role', 'personal');
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
          email: 'test_personal@fitlife.com',
          password: 'password123'
        });
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('message', 'Login successful');
      expect(res.body).toHaveProperty('token');
      personalToken = res.body.token;
    });

    test('Should retrieve authenticated user details using token', async () => {
      const res = await request(app)
        .get('/api/auth/me')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('email', 'test_personal@fitlife.com');
      expect(res.body).toHaveProperty('role', 'personal');
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

    test('Should create a new Student successfully (Personal Trainer)', async () => {
      const res = await request(app)
        .post('/api/personal/students')
        .set('Authorization', `Bearer ${personalToken}`)
        .send({
          name: 'Test Student',
          email: 'test_student@fitlife.com',
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
      expect(res.body).toHaveProperty('token');
      studentToken = res.body.token;
    });

    test('Should retrieve list of students linked to Personal Trainer', async () => {
      const res = await request(app)
        .get('/api/personal/students')
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
      expect(res.body[0]).toHaveProperty('email', 'test_student@fitlife.com');
    });

    test('Should get student details (Personal Trainer)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentId}`)
        .set('Authorization', `Bearer ${personalToken}`);
      expect(res.statusCode).toBe(200);
      expect(res.body).toHaveProperty('student');
      expect(res.body.student).toHaveProperty('email', 'test_student@fitlife.com');
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
          gifUrl: 'https://fitlife.com/flexao.gif',
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

  // ==========================================
  // 6. CHAT
  // ==========================================
  describe('Chat Endpoints', () => {
    beforeAll(async () => {
      const personalRes = await request(app)
        .post('/api/auth/register')
        .send({
          name: 'Other Personal',
          email: 'other_personal@fitlife.com',
          password: 'password123',
          accessKey: 'key_for_testing'
        });
      expect(personalRes.statusCode).toBe(201);
      otherPersonalToken = personalRes.body.token;
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
      otherStudentToken = loginRes.body.token;
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
          'Authorization': `Bearer ${studentToken}`
        }
      }, (res) => {
        expect(res.statusCode).toBe(200);
        expect(res.headers['content-type']).toContain('text/event-stream');
        expect(res.headers['connection']).toBe('keep-alive');
        res.destroy(); // Close the connection
        setTimeout(done, 50);
      });
    });
  });
});
