const knex = require('knex');
const config = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const db = knex(config[env]);

async function initializeDatabase() {
  try {
    // 1. users
    const hasUsers = await db.schema.hasTable('users');
    if (!hasUsers) {
      await db.schema.createTable('users', table => {
        table.increments('id').primary();
        table.string('name').notNullable();
        table.string('email').unique().notNullable();
        table.string('password_hash').notNullable();
        table.string('role').notNullable(); // 'personal' or 'student'
        table.timestamps(true, true);
      });
    }

    // 2. student_profiles
    const hasStudentProfiles = await db.schema.hasTable('student_profiles');
    if (!hasStudentProfiles) {
      await db.schema.createTable('student_profiles', table => {
        table.increments('id').primary();
        table.integer('student_id').unique().notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.float('height');
        table.float('target_weight');
        table.string('birth_date');
      });
    }

    // 3. workouts
    const hasWorkouts = await db.schema.hasTable('workouts');
    if (!hasWorkouts) {
      await db.schema.createTable('workouts', table => {
        table.increments('id').primary();
        table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('name').notNullable();
        table.text('description');
        table.timestamps(true, true);
      });
    }

    // 4. exercises
    const hasExercises = await db.schema.hasTable('exercises');
    if (!hasExercises) {
      await db.schema.createTable('exercises', table => {
        table.increments('id').primary();
        table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('name').notNullable();
        table.string('gif_url');
        table.text('description');
        table.timestamps(true, true);
      });
    }

    // 5. workout_exercises
    const hasWorkoutExercises = await db.schema.hasTable('workout_exercises');
    if (!hasWorkoutExercises) {
      await db.schema.createTable('workout_exercises', table => {
        table.increments('id').primary();
        table.integer('workout_id').notNullable().references('id').inTable('workouts').onDelete('CASCADE');
        table.integer('exercise_id').references('id').inTable('exercises').onDelete('SET NULL');
        table.string('name').notNullable();
        table.integer('sets').notNullable();
        table.string('reps').notNullable();
        table.string('weight');
        table.string('rest_time');
        table.text('notes');
      });
    }

    // 6. measurements
    const hasMeasurements = await db.schema.hasTable('measurements');
    if (!hasMeasurements) {
      await db.schema.createTable('measurements', table => {
        table.increments('id').primary();
        table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.float('weight').notNullable();
        table.float('chest');
        table.float('waist');
        table.float('hips');
        table.float('biceps_l');
        table.float('biceps_r');
        table.float('thigh_l');
        table.float('thigh_r');
        table.timestamp('recorded_at').defaultTo(db.fn.now());
      });
    }

    // 7. chat_messages
    const hasChatMessages = await db.schema.hasTable('chat_messages');
    if (!hasChatMessages) {
      await db.schema.createTable('chat_messages', table => {
        table.increments('id').primary();
        table.integer('sender_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.integer('receiver_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.text('message').notNullable();
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.integer('read_status').defaultTo(0);
      });
    }

    console.log('Database tables initialized successfully via Knex.');
  } catch (err) {
    console.error('Error initializing database tables via Knex:', err.message);
  }
}

initializeDatabase();

module.exports = db;
