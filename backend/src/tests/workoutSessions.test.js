process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const app = require('../index');
const db = require('../database');
const { generateToken } = require('../services/sessionService');

describe('BUS-01: Workout Execution Sessions API', () => {
  let personalToken;
  let personalUser;
  let studentToken;
  let studentUser;
  let otherPersonalToken;
  let otherPersonalUser;
  let otherStudentToken;
  let otherStudentUser;
  let createdWorkoutId;
  let workoutExerciseId;

  beforeAll(async () => {
    await db.ready;
    await db('workout_session_exercises').del();
    await db('workout_sessions').del();
    await db('workout_exercises').del();
    await db('workouts').del();
    await db('student_profiles').del();
    await db('users').del();

    // Personal A & Student A1
    const [personalId] = await db('users').insert({
      name: 'Personal Alpha',
      email: 'alpha.personal@test.com',
      password_hash: 'hashedpassword',
      role: 'personal'
    });
    personalUser = { id: personalId, email: 'alpha.personal@test.com', role: 'personal' };
    personalToken = generateToken(personalUser);

    const [studentId] = await db('users').insert({
      name: 'Student A1',
      email: 'student.a1@test.com',
      password_hash: 'hashedpassword',
      role: 'student'
    });
    studentUser = { id: studentId, email: 'student.a1@test.com', role: 'student' };
    studentToken = generateToken(studentUser);

    await db('student_profiles').insert({
      student_id: studentId,
      personal_id: personalId,
      height: 1.75,
      target_weight: 70
    });

    // Personal B & Student B1
    const [otherPersonalId] = await db('users').insert({
      name: 'Personal Beta',
      email: 'beta.personal@test.com',
      password_hash: 'hashedpassword',
      role: 'personal'
    });
    otherPersonalUser = { id: otherPersonalId, email: 'beta.personal@test.com', role: 'personal' };
    otherPersonalToken = generateToken(otherPersonalUser);

    const [otherStudentId] = await db('users').insert({
      name: 'Student B1',
      email: 'student.b1@test.com',
      password_hash: 'hashedpassword',
      role: 'student'
    });
    otherStudentUser = { id: otherStudentId, email: 'student.b1@test.com', role: 'student' };
    otherStudentToken = generateToken(otherStudentUser);

    await db('student_profiles').insert({
      student_id: otherStudentId,
      personal_id: otherPersonalId,
      height: 1.80,
      target_weight: 80
    });

    // Create workout for Student A1 by Personal A
    const [wId] = await db('workouts').insert({
      student_id: studentId,
      personal_id: personalId,
      name: 'Treino A - Peito e Tríceps',
      description: 'Ficha inicial'
    });
    createdWorkoutId = wId;

    const [weId] = await db('workout_exercises').insert({
      workout_id: wId,
      name: 'Supino Reto com Barra',
      sets: 4,
      reps: '12',
      weight: '40kg',
      rest_time: '60s',
      notes: 'Manter cotovelos alinhados'
    });
    workoutExerciseId = weId;
  });

  afterAll(async () => {
    await db('workout_session_exercises').del();
    await db('workout_sessions').del();
    await db('workout_exercises').del();
    await db('workouts').del();
    await db('student_profiles').del();
    await db('users').del();
  });

  test('POST /api/workout-sessions/start - Student A1 starts a workout session', async () => {
    const res = await request(app)
      .post('/api/workout-sessions/start')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ workoutId: createdWorkoutId });

    expect(res.status).toBe(201);
    expect(res.body.workout_name).toBe('Treino A - Peito e Tríceps');
    expect(res.body.status).toBe('in_progress');
    expect(res.body.student_id).toBe(studentUser.id);
    expect(res.body.exercises).toHaveLength(1);
    expect(res.body.exercises[0].exercise_name).toBe('Supino Reto com Barra');
    expect(res.body.exercises[0].sets_target).toBe(4);
    expect(res.body.exercises[0].completed).toBe(false);
  });

  test('POST /api/workout-sessions/start - returns 409 Conflict when student already has an active session', async () => {
    const res = await request(app)
      .post('/api/workout-sessions/start')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ workoutId: createdWorkoutId });

    expect(res.status).toBe(409);
    expect(res.body.error).toContain('already in progress');
  });

  test('POST /api/workout-sessions/start - IDOR protection blocks unauthorized student from starting session', async () => {
    const res = await request(app)
      .post('/api/workout-sessions/start')
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({ workoutId: createdWorkoutId });

    expect(res.status).toBe(403);
  });

  test('PATCH /api/workout-sessions/:id/exercises/:exerciseId - updates exercise execution progress', async () => {
    const sessions = await db('workout_sessions').where({ student_id: studentUser.id, status: 'in_progress' });
    const sessionId = sessions[0].id;
    const sessionExercises = await db('workout_session_exercises').where({ session_id: sessionId });
    const sessionExerciseId = sessionExercises[0].id;

    const res = await request(app)
      .patch(`/api/workout-sessions/${sessionId}/exercises/${sessionExerciseId}`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({
        setsCompleted: 4,
        weightUsed: '45kg',
        completed: true,
        notes: 'Executado com forma excelente'
      });

    expect(res.status).toBe(200);
    expect(res.body.sets_completed).toBe(4);
    expect(res.body.weight_used).toBe('45kg');
    expect(res.body.completed).toBe(true);
    expect(res.body.notes).toBe('Executado com forma excelente');
  });

  test('PATCH /api/workout-sessions/:id/exercises/:exerciseId - IDOR protection blocks cross-tenant updates', async () => {
    const sessions = await db('workout_sessions').where({ student_id: studentUser.id, status: 'in_progress' });
    const sessionId = sessions[0].id;
    const sessionExercises = await db('workout_session_exercises').where({ session_id: sessionId });

    const res = await request(app)
      .patch(`/api/workout-sessions/${sessionId}/exercises/${sessionExercises[0].id}`)
      .set('Authorization', `Bearer ${otherStudentToken}`)
      .send({ setsCompleted: 1 });

    expect(res.status).toBe(403);
  });

  test('POST /api/workout-sessions/:id/complete - completes active workout session and calculates duration', async () => {
    const sessions = await db('workout_sessions').where({ student_id: studentUser.id, status: 'in_progress' });
    const sessionId = sessions[0].id;

    const res = await request(app)
      .post(`/api/workout-sessions/${sessionId}/complete`)
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ notes: 'Treino rendeu muito bem!' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('completed');
    expect(res.body.completed_at).toBeDefined();
    expect(typeof res.body.duration_seconds).toBe('number');
    expect(res.body.notes).toBe('Treino rendeu muito bem!');
  });

  test('GET /api/workout-sessions - lists completed workout session history for student', async () => {
    const res = await request(app)
      .get('/api/workout-sessions')
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].status).toBe('completed');
    expect(res.body[0].exercises).toHaveLength(1);
  });

  test('GET /api/workout-sessions/:id - retrieves full session details', async () => {
    const sessions = await db('workout_sessions').where({ student_id: studentUser.id });
    const sessionId = sessions[0].id;

    const res = await request(app)
      .get(`/api/workout-sessions/${sessionId}`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(sessionId);
    expect(res.body.exercises).toHaveLength(1);
  });

  test('POST /api/workout-sessions/:id/cancel - cancels a new active workout session', async () => {
    // Start a new session
    const startRes = await request(app)
      .post('/api/workout-sessions/start')
      .set('Authorization', `Bearer ${studentToken}`)
      .send({ workoutId: createdWorkoutId });
    expect(startRes.status).toBe(201);
    const newSessionId = startRes.body.id;

    // Cancel session
    const cancelRes = await request(app)
      .post(`/api/workout-sessions/${newSessionId}/cancel`)
      .set('Authorization', `Bearer ${studentToken}`);

    expect(cancelRes.status).toBe(200);
    expect(cancelRes.body.status).toBe('cancelled');
    expect(cancelRes.body.completed_at).toBeDefined();
  });
});
