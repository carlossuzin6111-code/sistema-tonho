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
  'registration_keys',
  'audit_logs',
  'workout_sessions',
  'workout_session_exercises',
  'password_reset_tokens',
  'student_invitations',
  'email_verification_tokens',
  'signed_waivers',
  'student_assessments',
  'idempotency_keys',
  'workout_microcycles',
  'readiness_checkins'
];

const migrations = [
  '202607140001_initial_schema.js',
  '202607140002_add_query_indexes.js',
  '202607140003_create_registration_keys.js',
  '202607160001_normalize_user_emails.js',
  '202607160002_add_session_version.js',
  '202607170001_create_audit_logs.js',
  '202607180001_add_registration_key_expiry.js',
  '202607180002_add_user_avatars.js',
  '202607190001_add_exercise_favorites_and_custom.js',
  '202607200001_create_workout_sessions.js',
  '202607200002_create_password_reset_tokens.js',
  '202607290001_add_must_change_password.js',
  '202607290002_create_student_invitations.js',
  '202607290003_add_email_verification.js',
  '202607290004_create_signed_waivers.js',
  '202607290005_add_domain_constraints.js',
  '202607290006_add_optimistic_versions.js',
  '202607290007_add_workout_status.js',
  '202607290008_add_student_lifecycle_status.js',
  '202607290009_create_student_assessments.js',

  '202607290010_add_session_activity.js',
  '202607290011_create_idempotency_keys.js',
  '202607290012_create_workout_microcycles.js'
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
    await expect(db.schema.hasColumn('users', 'avatar_filename')).resolves.toBe(true);
    await expect(db.schema.hasColumn('users', 'avatar_updated_at')).resolves.toBe(true);
    await expect(db.schema.hasColumn('users', 'must_change_password')).resolves.toBe(true);
    await expect(db.schema.hasColumn('users', 'version')).resolves.toBe(true);
    await expect(db.schema.hasColumn('workouts', 'version')).resolves.toBe(true);
    await expect(db.schema.hasColumn('workouts', 'status')).resolves.toBe(true);
    await expect(db.schema.hasColumn('workout_sessions', 'last_activity_at')).resolves.toBe(true);
    await expect(db.schema.hasColumn('users', 'account_status')).resolves.toBe(true);
    await expect(db.schema.hasColumn('student_profiles', 'relationship_status')).resolves.toBe(true);
    await expect(db.schema.hasTable('student_assessments')).resolves.toBe(true);
    await expect(db.schema.hasTable('idempotency_keys')).resolves.toBe(true);
    await expect(db.schema.hasColumn('workout_exercises', 'version')).resolves.toBe(true);
    await expect(db.schema.hasColumn('registration_keys', 'expires_at')).resolves.toBe(true);
    const emailIndex = await db('sqlite_master')
      .select('name')
      .where({ type: 'index', name: 'users_email_normalized_unique' })
      .first();
    expect(emailIndex).toBeTruthy();
    const auditIndexes = await db('sqlite_master')
      .pluck('name')
      .where({ type: 'index', tbl_name: 'audit_logs' });
    expect(auditIndexes).toEqual(expect.arrayContaining([
      'audit_logs_actor_created_idx',
      'audit_logs_action_created_idx'
    ]));
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

  test('gives legacy unused registration keys a grace period', async () => {
    db = createDatabase();
    await db.migrate.up({ name: '202607140001_initial_schema.js' });
    await db.migrate.up({ name: '202607140002_add_query_indexes.js' });
    await db.migrate.up({ name: '202607140003_create_registration_keys.js' });
    await db('registration_keys').insert([
      { key_hash: 'a'.repeat(64) },
      { key_hash: 'b'.repeat(64), used_at: db.fn.now() }
    ]);

    await db.migrate.up({ name: '202607180001_add_registration_key_expiry.js' });

    const unused = await db('registration_keys').where({ key_hash: 'a'.repeat(64) }).first();
    const used = await db('registration_keys').where({ key_hash: 'b'.repeat(64) }).first();
    expect(unused.expires_at).toBeTruthy();
    expect(used.expires_at).toBeNull();
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
