const knex = require('knex');
const knexConfig = require('../../knexfile');

describe('SQLite Foreign Keys Enforcement', () => {
  let db;

  beforeAll(async () => {
    // Create an in-memory test database instance with foreign keys enabled
    db = knex(knexConfig.test);
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    // Clear tables between tests in reverse dependency order
    await db('chat_messages').del();
    await db('measurements').del();
    await db('workout_exercises').del();
    await db('workouts').del();
    await db('exercises').del();
    await db('student_profiles').del();
    await db('users').del();
  });

  test('PRAGMA foreign_keys is enabled on Knex connections', async () => {
    const result = await db.raw('PRAGMA foreign_keys;');
    expect(result[0].foreign_keys).toBe(1);
  });

  test('rejects inserting orphan records referencing non-existent parent user', async () => {
    // Attempting to insert a workout for non-existent student_id and personal_id
    await expect(
      db('workouts').insert({
        student_id: 99999,
        personal_id: 99998,
        name: 'Orphan Workout',
        description: 'Should fail FK constraint'
      })
    ).rejects.toThrow(/(FOREIGN KEY constraint failed|constraint failed)/i);

    // Attempting to insert student profile for non-existent user
    await expect(
      db('student_profiles').insert({
        student_id: 99999,
        personal_id: 99998,
        height: 175
      })
    ).rejects.toThrow(/(FOREIGN KEY constraint failed|constraint failed)/i);
  });

  test('rejects inserting orphan workout_exercise referencing non-existent workout', async () => {
    await expect(
      db('workout_exercises').insert({
        workout_id: 88888,
        name: 'Bench Press',
        sets: 3,
        reps: '10'
      })
    ).rejects.toThrow(/(FOREIGN KEY constraint failed|constraint failed)/i);
  });

  test('cascades deletion automatically when parent user is deleted (ON DELETE CASCADE)', async () => {
    // 1. Create personal and student users
    const [personalId] = await db('users').insert({
      name: 'Coach John',
      email: 'john@example.com',
      password_hash: 'hash123',
      role: 'personal'
    });

    const [studentId] = await db('users').insert({
      name: 'Student Bob',
      email: 'bob@example.com',
      password_hash: 'hash123',
      role: 'student'
    });

    // 2. Create student profile
    await db('student_profiles').insert({
      student_id: studentId,
      personal_id: personalId,
      height: 180,
      target_weight: 75
    });

    // 3. Create workout and workout exercise
    const [workoutId] = await db('workouts').insert({
      student_id: studentId,
      personal_id: personalId,
      name: 'Leg Day'
    });

    const [exerciseId] = await db('exercises').insert({
      personal_id: personalId,
      name: 'Squat'
    });

    await db('workout_exercises').insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      name: 'Squat',
      sets: 4,
      reps: '12'
    });

    // 4. Create measurement
    await db('measurements').insert({
      student_id: studentId,
      weight: 78.5
    });

    // 5. Create chat message
    await db('chat_messages').insert({
      sender_id: personalId,
      receiver_id: studentId,
      message: 'Great workout!'
    });

    // Verify records exist before deletion
    expect(await db('student_profiles').where({ student_id: studentId })).toHaveLength(1);
    expect(await db('workouts').where({ id: workoutId })).toHaveLength(1);
    expect(await db('workout_exercises').where({ workout_id: workoutId })).toHaveLength(1);
    expect(await db('measurements').where({ student_id: studentId })).toHaveLength(1);
    expect(await db('chat_messages').where({ receiver_id: studentId })).toHaveLength(1);

    // Act: Delete student user
    await db('users').where({ id: studentId }).del();

    // Assert: Child records deleted by CASCADE constraint
    expect(await db('student_profiles').where({ student_id: studentId })).toHaveLength(0);
    expect(await db('workouts').where({ id: workoutId })).toHaveLength(0);
    expect(await db('workout_exercises').where({ workout_id: workoutId })).toHaveLength(0);
    expect(await db('measurements').where({ student_id: studentId })).toHaveLength(0);
    expect(await db('chat_messages').where({ receiver_id: studentId })).toHaveLength(0);
  });

  test('sets FK to NULL when referenced exercise is deleted (ON DELETE SET NULL)', async () => {
    const [personalId] = await db('users').insert({
      name: 'Coach Jane',
      email: 'jane@example.com',
      password_hash: 'hash123',
      role: 'personal'
    });

    const [studentId] = await db('users').insert({
      name: 'Student Alice',
      email: 'alice@example.com',
      password_hash: 'hash123',
      role: 'student'
    });

    const [workoutId] = await db('workouts').insert({
      student_id: studentId,
      personal_id: personalId,
      name: 'Upper Body'
    });

    const [exerciseId] = await db('exercises').insert({
      personal_id: personalId,
      name: 'Custom Push Up'
    });

    const [weId] = await db('workout_exercises').insert({
      workout_id: workoutId,
      exercise_id: exerciseId,
      name: 'Custom Push Up',
      sets: 3,
      reps: '15'
    });

    // Delete exercise
    await db('exercises').where({ id: exerciseId }).del();

    // Verify workout_exercise row remains, but exercise_id is set to null
    const weRow = await db('workout_exercises').where({ id: weId }).first();
    expect(weRow).toBeDefined();
    expect(weRow.exercise_id).toBeNull();
  });
});
