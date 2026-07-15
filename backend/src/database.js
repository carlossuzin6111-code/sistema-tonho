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

    // Tests must stay deterministic and must not depend on external translation calls.
    if (env !== 'test') {
      startBackgroundTranslation(db);
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

async function startBackgroundTranslation(dbConnection) {
  console.log('Background exercise translator worker started...');
  while (true) {
    try {
      const ex = await dbConnection('exercises')
        .where('is_translated', false)
        .orWhereNull('is_translated')
        .first();

      if (!ex) {
        await new Promise(resolve => setTimeout(resolve, 15000));
        continue;
      }

      const query = `${ex.name} ||| ${ex.description}`;
      const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(query)}`;

      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429) {
          console.warn('Translate API rate limit hit in background. Sleeping for 15 seconds...');
          await new Promise(resolve => setTimeout(resolve, 15000));
          continue;
        }
        throw new Error(`HTTP error ${res.status}`);
      }

      const json = await res.json();
      const translated = json[0].map(x => x[0]).join('');
      const parts = translated.split(' ||| ').map(x => x.trim());

      if (parts.length === 2) {
        await dbConnection('exercises')
          .where('id', ex.id)
          .update({
            name: parts[0],
            description: parts[1],
            is_translated: true
          });
        console.log(`[Translator] Translated exercise: "${ex.name}" -> "${parts[0]}"`);
      } else {
        const transName = await translateSingleText(ex.name);
        const transDesc = await translateSingleText(ex.description);
        await dbConnection('exercises')
          .where('id', ex.id)
          .update({
            name: transName || ex.name,
            description: transDesc || ex.description,
            is_translated: true
          });
        console.log(`[Translator fallback] Translated exercise: "${ex.name}" -> "${transName}"`);
      }
    } catch (err) {
      console.error('[Translator Error] Failed translating exercise:', err.message);
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    await new Promise(resolve => setTimeout(resolve, 800));
  }
}

async function translateSingleText(text) {
  if (!text) return '';
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=pt&dt=t&q=${encodeURIComponent(text)}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return text;
    const json = await res.json();
    return json[0].map(x => x[0]).join('').trim();
  } catch (err) {
    return text;
  }
}

db.ready = initializeDatabase();

db.seedDefaultExercisesForPersonal = seedDefaultExercisesForPersonal;

module.exports = db;
