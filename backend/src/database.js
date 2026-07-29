const knex = require('knex');
const config = require('../knexfile');

const env = process.env.NODE_ENV || 'development';
const db = knex(config[env]);

async function initializeDatabase() {
  try {
    const [, appliedMigrations] = await db.migrate.latest();
    if (appliedMigrations.length > 0) {
      console.log(`Applied database migrations: ${appliedMigrations.join(', ')}`);
    } else {
      console.log('Database schema is up to date.');
    }

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
          is_translated: false,
          catalog_scope: 'global',
          canonical_name: formattedName.trim().toLowerCase()
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
