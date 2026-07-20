process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const request = require('supertest');
const jwt = require('jsonwebtoken');
const knex = require('knex');
const knexConfig = require('../../knexfile');
const { JWT_SECRET } = require('../services/sessionService');

// Require app without starting listening server
const db = require('../database');
let app;

function generateBearerToken(user) {
  return jwt.sign(
    {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      sessionVersion: user.session_version || 0
    },
    JWT_SECRET,
    { expiresIn: '1h' }
  );
}

describe('IDOR & Cross-Tenant Access Matrix (SEC-01)', () => {
  let personalA, tokenPersonalA;
  let studentA1, tokenStudentA1;
  let personalB, tokenPersonalB;
  let studentB1, tokenStudentB1;

  beforeAll(async () => {
    app = require('../index');
    await db.ready;
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear tables
    await db('chat_messages').del();
    await db('measurements').del();
    await db('workout_exercises').del();
    await db('workouts').del();
    await db('exercises').del();
    await db('student_profiles').del();
    await db('users').del();

    // 1. Create Personal Trainer A & Student A1 (linked to A)
    const [pAId] = await db('users').insert({
      name: 'Personal Trainer A',
      email: 'personala@example.com',
      password_hash: 'hash',
      role: 'personal',
      session_version: 0
    });
    personalA = { id: pAId, name: 'Personal Trainer A', email: 'personala@example.com', role: 'personal', session_version: 0 };
    tokenPersonalA = generateBearerToken(personalA);

    const [sA1Id] = await db('users').insert({
      name: 'Student A1',
      email: 'studenta1@example.com',
      password_hash: 'hash',
      role: 'student',
      session_version: 0
    });
    studentA1 = { id: sA1Id, name: 'Student A1', email: 'studenta1@example.com', role: 'student', session_version: 0 };
    tokenStudentA1 = generateBearerToken(studentA1);

    await db('student_profiles').insert({
      student_id: sA1Id,
      personal_id: pAId,
      height: 170,
      target_weight: 65
    });

    // 2. Create Personal Trainer B & Student B1 (linked to B)
    const [pBId] = await db('users').insert({
      name: 'Personal Trainer B',
      email: 'personalb@example.com',
      password_hash: 'hash',
      role: 'personal',
      session_version: 0
    });
    personalB = { id: pBId, name: 'Personal Trainer B', email: 'personalb@example.com', role: 'personal', session_version: 0 };
    tokenPersonalB = generateBearerToken(personalB);

    const [sB1Id] = await db('users').insert({
      name: 'Student B1',
      email: 'studentb1@example.com',
      password_hash: 'hash',
      role: 'student',
      session_version: 0
    });
    studentB1 = { id: sB1Id, name: 'Student B1', email: 'studentb1@example.com', role: 'student', session_version: 0 };
    tokenStudentB1 = generateBearerToken(studentB1);

    await db('student_profiles').insert({
      student_id: sB1Id,
      personal_id: pBId,
      height: 180,
      target_weight: 80
    });
  });

  describe('1. Student Details Endpoint (GET /api/personal/students/:id)', () => {
    test('Personal A can access linked Student A1 details', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentA1.id}`)
        .set('Authorization', `Bearer ${tokenPersonalA}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.student.id).toBe(studentA1.id);
    });

    test('Personal A cannot access unlinked Student B1 details (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentB1.id}`)
        .set('Authorization', `Bearer ${tokenPersonalA}`);
      expect(res.statusCode).toBe(403);
      expect(res.body.error).toMatch(/access denied/i);
    });

    test('Student A1 can access own details', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentA1.id}`)
        .set('Authorization', `Bearer ${tokenStudentA1}`);
      expect(res.statusCode).toBe(200);
      expect(res.body.student.id).toBe(studentA1.id);
    });

    test('Student A1 cannot access Student B1 details (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/personal/students/${studentB1.id}`)
        .set('Authorization', `Bearer ${tokenStudentA1}`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('2. Student Password Reset (POST /api/personal/students/:id/reset-password)', () => {
    test('Personal A can reset linked Student A1 password', async () => {
      const res = await request(app)
        .post(`/api/personal/students/${studentA1.id}/reset-password`)
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ newPassword: 'newPassword123' });
      expect(res.statusCode).toBe(200);
    });

    test('Personal A cannot reset unlinked Student B1 password (IDOR blocked)', async () => {
      const res = await request(app)
        .post(`/api/personal/students/${studentB1.id}/reset-password`)
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ newPassword: 'newPassword123' });
      expect(res.statusCode).toBe(403);
    });

    test('Student cannot reset password via personal endpoint', async () => {
      const res = await request(app)
        .post(`/api/personal/students/${studentB1.id}/reset-password`)
        .set('Authorization', `Bearer ${tokenStudentA1}`)
        .send({ newPassword: 'newPassword123' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('3. Measurements Endpoints (GET/POST /api/student/measurements)', () => {
    test('Personal A can record measurement for linked Student A1', async () => {
      const res = await request(app)
        .post('/api/student/measurements')
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ studentId: studentA1.id, weight: 66.5 });
      expect(res.statusCode).toBe(201);
    });

    test('Personal A cannot record measurement for unlinked Student B1 (IDOR blocked)', async () => {
      const res = await request(app)
        .post('/api/student/measurements')
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ studentId: studentB1.id, weight: 81.0 });
      expect(res.statusCode).toBe(403);
    });

    test('Student A1 providing studentB1.id when recording measurement records for self only', async () => {
      const res = await request(app)
        .post('/api/student/measurements')
        .set('Authorization', `Bearer ${tokenStudentA1}`)
        .send({ studentId: studentB1.id, weight: 67.0 });
      expect(res.statusCode).toBe(201);

      // Verify measurement was attached to studentA1, NOT studentB1
      const studentB1Measurements = await db('measurements').where('student_id', studentB1.id);
      expect(studentB1Measurements).toHaveLength(0);

      const studentA1Measurements = await db('measurements').where('student_id', studentA1.id);
      expect(studentA1Measurements).toHaveLength(1);
    });

    test('Personal A cannot read unlinked Student B1 measurements (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/student/measurements?studentId=${studentB1.id}`)
        .set('Authorization', `Bearer ${tokenPersonalA}`);
      expect(res.statusCode).toBe(403);
    });
  });

  describe('4. Workouts Management IDOR (POST/GET/DELETE /api/workouts)', () => {
    test('Personal A can create workout for linked Student A1', async () => {
      const res = await request(app)
        .post('/api/workouts')
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ studentId: studentA1.id, name: 'Leg Day' });
      expect(res.statusCode).toBe(201);
    });

    test('Personal A cannot create workout for unlinked Student B1 (IDOR blocked)', async () => {
      const res = await request(app)
        .post('/api/workouts')
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ studentId: studentB1.id, name: 'Malicious Workout' });
      expect(res.statusCode).toBe(403);
    });

    test('Personal B cannot delete workout belonging to Personal A (IDOR blocked)', async () => {
      // 1. Personal A creates a workout
      const [wId] = await db('workouts').insert({
        student_id: studentA1.id,
        personal_id: personalA.id,
        name: 'Personal A Workout'
      });

      // 2. Personal B attempts to delete Personal A's workout
      const res = await request(app)
        .delete(`/api/workouts/${wId}`)
        .set('Authorization', `Bearer ${tokenPersonalB}`);
      expect(res.statusCode).toBe(403);

      // Verify workout still exists
      const row = await db('workouts').where({ id: wId }).first();
      expect(row).toBeDefined();
    });

    test('Personal B cannot add exercise to Personal A workout (IDOR blocked)', async () => {
      const [wId] = await db('workouts').insert({
        student_id: studentA1.id,
        personal_id: personalA.id,
        name: 'Personal A Workout'
      });

      const res = await request(app)
        .post(`/api/workouts/${wId}/exercises`)
        .set('Authorization', `Bearer ${tokenPersonalB}`)
        .send({ name: 'Cross-Tenant Pushup', sets: 3, reps: '10' });
      expect(res.statusCode).toBe(403);
    });

    test('Personal B cannot delete exercise from Personal A workout (IDOR blocked)', async () => {
      const [wId] = await db('workouts').insert({
        student_id: studentA1.id,
        personal_id: personalA.id,
        name: 'Personal A Workout'
      });

      const [weId] = await db('workout_exercises').insert({
        workout_id: wId,
        name: 'Bench Press',
        sets: 3,
        reps: '10'
      });

      const res = await request(app)
        .delete(`/api/exercises/${weId}`)
        .set('Authorization', `Bearer ${tokenPersonalB}`);
      expect(res.statusCode).toBe(403);

      // Verify exercise was not deleted
      const row = await db('workout_exercises').where({ id: weId }).first();
      expect(row).toBeDefined();
    });
  });

  describe('5. Catalog Exercises IDOR (DELETE/PATCH /api/catalog/exercises)', () => {
    test('Personal B cannot delete Personal A catalog exercise (IDOR blocked)', async () => {
      const [exId] = await db('exercises').insert({
        personal_id: personalA.id,
        name: 'Personal A Custom Exercise',
        is_custom: true
      });

      const res = await request(app)
        .delete(`/api/catalog/exercises/${exId}`)
        .set('Authorization', `Bearer ${tokenPersonalB}`);
      expect(res.statusCode).toBe(403);
    });

    test('Personal B cannot toggle favorite on Personal A catalog exercise (IDOR blocked)', async () => {
      const [exId] = await db('exercises').insert({
        personal_id: personalA.id,
        name: 'Personal A Custom Exercise',
        is_custom: true
      });

      const res = await request(app)
        .patch(`/api/catalog/exercises/${exId}/favorite`)
        .set('Authorization', `Bearer ${tokenPersonalB}`);
      expect(res.statusCode).toBe(404);
    });
  });

  describe('6. Chat Access & Messaging IDOR (GET/POST /api/chat)', () => {
    test('Personal A cannot read chat history with unlinked Student B1 (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/chat/${studentB1.id}`)
        .set('Authorization', `Bearer ${tokenPersonalA}`);
      expect(res.statusCode).toBe(403);
    });

    test('Personal A cannot send chat message to unlinked Student B1 (IDOR blocked)', async () => {
      const res = await request(app)
        .post('/api/chat')
        .set('Authorization', `Bearer ${tokenPersonalA}`)
        .send({ receiverId: studentB1.id, message: 'Unauthorized message' });
      expect(res.statusCode).toBe(403);
    });
  });

  describe('7. Profile Avatar Viewing IDOR (GET /api/profile/avatar/:userId)', () => {
    test('Personal B cannot view Student A1 avatar (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/profile/avatar/${studentA1.id}`)
        .set('Authorization', `Bearer ${tokenPersonalB}`);
      expect(res.statusCode).toBe(404);
    });

    test('Student B1 cannot view Student A1 avatar (IDOR blocked)', async () => {
      const res = await request(app)
        .get(`/api/profile/avatar/${studentA1.id}`)
        .set('Authorization', `Bearer ${tokenStudentB1}`);
      expect(res.statusCode).toBe(404);
    });
  });
});
