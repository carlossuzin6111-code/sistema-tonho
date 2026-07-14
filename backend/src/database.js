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
        table.boolean('is_translated').defaultTo(false);
        table.timestamps(true, true);
      });
    } else {
      const hasIsTranslated = await db.schema.hasColumn('exercises', 'is_translated');
      if (!hasIsTranslated) {
        await db.schema.alterTable('exercises', table => {
          table.boolean('is_translated').defaultTo(false);
        });
      }
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

    // Seed default exercises for existing personals
    const personals = await db('users').where('role', 'personal');
    for (const personal of personals) {
      await seedDefaultExercisesForPersonal(db, personal.id);
    }

  } catch (err) {
    console.error('Error initializing database tables via Knex:', err.message);
    throw err;
  }
}

const defaultExercisesJson = require('./db/default_exercises.json');

async function seedDefaultExercisesForPersonal(dbConnection, personalId) {
  try {
    const existing = await dbConnection('exercises').where('personal_id', personalId);
    const existingNames = new Set(existing.map(ex => ex.name));

    const exercisesToInsert = [];
    for (const ex of defaultExercisesJson) {
      const formattedName = ex.name
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');

      if (!existingNames.has(formattedName)) {
        const fullGifUrl = `https://raw.githubusercontent.com/hasaneyldrm/exercises-dataset/main/${ex.gif_url}`;
        const description = `Target: ${ex.target} | Equipment: ${ex.equipment}\n\n${ex.instructions.en}`;

        exercisesToInsert.push({
          personal_id: personalId,
          name: formattedName,
          gif_url: fullGifUrl,
          description: description,
          is_translated: false
        });
      }
    }

    if (exercisesToInsert.length > 0) {
      await dbConnection.batchInsert('exercises', exercisesToInsert, 100);
      console.log(`Successfully seeded ${exercisesToInsert.length} new default exercises for personal ID ${personalId}.`);
    }
  } catch (err) {
    console.error(`Error seeding exercises for personal ${personalId}:`, err.message);
  }
}

db.ready = initializeDatabase();

db.seedDefaultExercisesForPersonal = seedDefaultExercisesForPersonal;

module.exports = db;
