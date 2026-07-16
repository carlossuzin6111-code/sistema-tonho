const knex = require('knex');
const config = require('../../knexfile');

const applicationTables = [
  'users',
  'student_profiles',
  'workouts',
  'exercises',
  'workout_exercises',
  'measurements',
  'chat_messages',
  'registration_keys'
];

const migrations = [
  '202607140001_initial_schema.js',
  '202607140002_add_query_indexes.js',
  '202607140003_create_registration_keys.js',
  '202607160001_normalize_user_emails.js',
  '202607160002_add_session_version.js'
];

function createDatabase() {
  return knex(config.test);
}

describe('database migrations', () => {
  let db;

  afterEach(async () => {
    if (db) {
      await db.destroy();
      db = null;
    }
  });

  test('creates the complete schema in an empty database', async () => {
    db = createDatabase();

    const [batch, appliedMigrations] = await db.migrate.latest();

    expect(batch).toBe(1);
    expect(appliedMigrations).toEqual(migrations);

    for (const table of applicationTables) {
      await expect(db.schema.hasTable(table)).resolves.toBe(true);
    }
    await expect(db.schema.hasColumn('exercises', 'is_translated')).resolves.toBe(true);
    await expect(db.schema.hasColumn('users', 'session_version')).resolves.toBe(true);
    const emailIndex = await db('sqlite_master')
      .select('name')
      .where({ type: 'index', name: 'users_email_normalized_unique' })
      .first();
    expect(emailIndex).toBeTruthy();
  });

  test('preserves legacy data while bringing an existing schema under migrations', async () => {
    db = createDatabase();

    await db.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password_hash').notNullable();
      table.string('role').notNullable();
      table.timestamps(true, true);
    });
    await db.schema.createTable('exercises', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('gif_url');
      table.text('description');
      table.timestamps(true, true);
    });

    const [personalId] = await db('users').insert({
      name: 'Legacy Personal',
      email: ' Legacy@Example.COM ',
      password_hash: 'legacy-hash',
      role: 'personal'
    });
    const [exerciseId] = await db('exercises').insert({
      personal_id: personalId,
      name: 'Legacy Exercise',
      description: 'Must survive the baseline migration'
    });

    await db.migrate.latest();

    const exercise = await db('exercises').where({ id: exerciseId }).first();
    expect(exercise).toMatchObject({
      name: 'Legacy Exercise',
      description: 'Must survive the baseline migration',
      is_translated: 0
    });
    const legacyUser = await db('users').where({ id: personalId }).first();
    expect(legacyUser.email).toBe('legacy@example.com');
    expect(await db('knex_migrations').pluck('name')).toEqual(migrations);
  });

  test('refuses normalization when case-insensitive duplicate emails exist', async () => {
    db = createDatabase();
    await db.migrate.up({ name: '202607140001_initial_schema.js' });
    await db.migrate.up({ name: '202607140002_add_query_indexes.js' });
    await db.migrate.up({ name: '202607140003_create_registration_keys.js' });

    await db('users').insert([
      { name: 'First', email: 'person@example.com', password_hash: 'hash', role: 'personal' },
      { name: 'Second', email: 'PERSON@example.com', password_hash: 'hash', role: 'personal' }
    ]);

    await expect(db.migrate.latest()).rejects.toThrow(
      'Cannot normalize user emails while case-insensitive duplicates exist'
    );
  });

  test('rolls back the application schema in reverse dependency order', async () => {
    db = createDatabase();
    await db.migrate.latest();

    const [batch, rolledBackMigrations] = await db.migrate.rollback();

    expect(batch).toBe(1);
    expect(rolledBackMigrations).toEqual([...migrations].reverse());
    for (const table of applicationTables) {
      await expect(db.schema.hasTable(table)).resolves.toBe(false);
    }
  });
});
