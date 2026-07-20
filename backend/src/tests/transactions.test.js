const knex = require('knex');
const knexConfig = require('../../knexfile');

describe('Composite Creation Transactions (DB-08)', () => {
  let db;

  beforeAll(async () => {
    db = knex(knexConfig.test);
    await db.migrate.latest();
  });

  afterAll(async () => {
    await db.destroy();
  });

  beforeEach(async () => {
    await db('chat_messages').del();
    await db('measurements').del();
    await db('workout_exercises').del();
    await db('workouts').del();
    await db('exercises').del();
    await db('student_profiles').del();
    await db('users').del();
  });

  describe('Student Registration Transaction', () => {
    test('creates student user and profile atomically in a transaction', async () => {
      const [personalId] = await db('users').insert({
        name: 'Personal Trainer',
        email: 'personal@example.com',
        password_hash: 'hash',
        role: 'personal'
      });

      const studentId = await db.transaction(async trx => {
        const [id] = await trx('users').insert({
          name: 'New Student',
          email: 'newstudent@example.com',
          password_hash: 'hash',
          role: 'student'
        });

        await trx('student_profiles').insert({
          student_id: id,
          personal_id: personalId,
          height: 175,
          target_weight: 70
        });

        return id;
      });

      const userRow = await db('users').where({ id: studentId }).first();
      const profileRow = await db('student_profiles').where({ student_id: studentId }).first();

      expect(userRow).toBeDefined();
      expect(userRow.email).toBe('newstudent@example.com');
      expect(profileRow).toBeDefined();
      expect(profileRow.personal_id).toBe(personalId);
    });

    test('rolls back user creation if profile insertion fails during registration', async () => {
      const email = 'failedstudent@example.com';

      await expect(
        db.transaction(async trx => {
          const [id] = await trx('users').insert({
            name: 'Failed Student',
            email,
            password_hash: 'hash',
            role: 'student'
          });

          // Intentionally cause FK constraint failure by using non-existent personal_id
          await trx('student_profiles').insert({
            student_id: id,
            personal_id: 999999, // Non-existent personal trainer
            height: 180
          });

          return id;
        })
      ).rejects.toThrow();

      // Verify that no user record exists due to complete rollback
      const orphanUser = await db('users').where({ email }).first();
      expect(orphanUser).toBeUndefined();
    });
  });

  describe('Workout & Exercises Creation Transaction', () => {
    test('creates workout and all exercises atomically in a transaction', async () => {
      const [personalId] = await db('users').insert({
        name: 'Coach Dave',
        email: 'dave@example.com',
        password_hash: 'hash',
        role: 'personal'
      });

      const [studentId] = await db('users').insert({
        name: 'Student Bob',
        email: 'bob@example.com',
        password_hash: 'hash',
        role: 'student'
      });

      await db('student_profiles').insert({
        student_id: studentId,
        personal_id: personalId
      });

      const exercisesList = [
        { name: 'Push Up', sets: 3, reps: '15' },
        { name: 'Pull Up', sets: 4, reps: '10' }
      ];

      const workoutId = await db.transaction(async trx => {
        const [id] = await trx('workouts').insert({
          student_id: studentId,
          personal_id: personalId,
          name: 'Upper Body Workout'
        });

        for (const ex of exercisesList) {
          await trx('workout_exercises').insert({
            workout_id: id,
            name: ex.name,
            sets: ex.sets,
            reps: ex.reps
          });
        }

        return id;
      });

      const workoutRow = await db('workouts').where({ id: workoutId }).first();
      const exerciseRows = await db('workout_exercises').where({ workout_id: workoutId });

      expect(workoutRow).toBeDefined();
      expect(workoutRow.name).toBe('Upper Body Workout');
      expect(exerciseRows).toHaveLength(2);
    });

    test('rolls back entire workout creation if any exercise insertion fails', async () => {
      const [personalId] = await db('users').insert({
        name: 'Coach Dave',
        email: 'dave2@example.com',
        password_hash: 'hash',
        role: 'personal'
      });

      const [studentId] = await db('users').insert({
        name: 'Student Alice',
        email: 'alice2@example.com',
        password_hash: 'hash',
        role: 'student'
      });

      await db('student_profiles').insert({
        student_id: studentId,
        personal_id: personalId
      });

      const workoutName = 'Doomed Workout';

      await expect(
        db.transaction(async trx => {
          const [id] = await trx('workouts').insert({
            student_id: studentId,
            personal_id: personalId,
            name: workoutName
          });

          // Insert 1st exercise successfully
          await trx('workout_exercises').insert({
            workout_id: id,
            name: 'Valid Exercise',
            sets: 3,
            reps: '10'
          });

          // 2nd exercise insertion fails (e.g. invalid foreign key reference for exercise_id)
          await trx('workout_exercises').insert({
            workout_id: id,
            name: 'Invalid Exercise',
            sets: 3,
            reps: '10',
            exercise_id: 999999 // Non-existent catalog exercise
          });

          return id;
        })
      ).rejects.toThrow();

      // Verify that neither workout nor workout_exercises exist in the database
      const orphanWorkout = await db('workouts').where({ name: workoutName }).first();
      expect(orphanWorkout).toBeUndefined();

      const orphanExercises = await db('workout_exercises').where({ name: 'Valid Exercise' });
      expect(orphanExercises).toHaveLength(0);
    });
  });
});
