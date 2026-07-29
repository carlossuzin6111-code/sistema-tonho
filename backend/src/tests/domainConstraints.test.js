process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-jwt-secret-with-at-least-32-bytes';

const knex = require('knex');
const config = require('../../knexfile');

describe('DB-09 domain constraints', () => {
  let db;
  beforeAll(async () => { db = knex(config.test); await db.migrate.latest(); });
  afterAll(async () => db.destroy());

  test('rejects invalid measurement values at database level', async () => {
    const [userId] = await db('users').insert({ name: 'Constraint User', email: 'constraints@test.com', password_hash: 'hash', role: 'student' });
    await expect(db('measurements').insert({ student_id: userId, weight: 0 })).rejects.toThrow(/measurement values/i);
  });

  test('rejects non-positive exercise sets at database level', async () => {
    const [personalId] = await db('users').insert({ name: 'Constraint Personal', email: 'constraints-personal@test.com', password_hash: 'hash', role: 'personal' });
    const [studentId] = await db('users').insert({ name: 'Constraint Student', email: 'constraints-student@test.com', password_hash: 'hash', role: 'student' });
    const [workoutId] = await db('workouts').insert({ student_id: studentId, personal_id: personalId, name: 'Constraint Workout' });
    await expect(db('workout_exercises').insert({ workout_id: workoutId, name: 'Exercise', sets: 0, reps: '10' })).rejects.toThrow(/sets must be positive/i);
  });
});
