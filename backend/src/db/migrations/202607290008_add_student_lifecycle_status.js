exports.up = async function up(knex) {
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'account_status'))) {
    await knex.schema.alterTable('users', table => table.string('account_status').notNullable().defaultTo('active'));
  }
  if (await knex.schema.hasTable('student_profiles') && !(await knex.schema.hasColumn('student_profiles', 'relationship_status'))) {
    await knex.schema.alterTable('student_profiles', table => table.string('relationship_status').notNullable().defaultTo('active'));
  }
  for (const [name, column, values] of [
    ['users_account_status', 'account_status', "'active', 'suspended', 'archived'"],
    ['student_relationship_status', 'relationship_status', "'invited', 'active', 'paused', 'blocked'"]
  ]) {
    const table = name.startsWith('users') ? 'users' : 'student_profiles';
    await knex.raw(`CREATE TRIGGER IF NOT EXISTS ${name}_insert_check BEFORE INSERT ON ${table} WHEN NEW.${column} NOT IN (${values}) BEGIN SELECT RAISE(ABORT, 'invalid lifecycle status'); END;`);
    await knex.raw(`CREATE TRIGGER IF NOT EXISTS ${name}_update_check BEFORE UPDATE OF ${column} ON ${table} WHEN NEW.${column} NOT IN (${values}) BEGIN SELECT RAISE(ABORT, 'invalid lifecycle status'); END;`);
  }
};

exports.down = async function down(knex) {
  for (const name of ['users_account_status', 'student_relationship_status']) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${name}_insert_check`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${name}_update_check`);
  }
  if (await knex.schema.hasTable('student_profiles') && await knex.schema.hasColumn('student_profiles', 'relationship_status')) await knex.schema.alterTable('student_profiles', t => t.dropColumn('relationship_status'));
  if (await knex.schema.hasTable('users') && await knex.schema.hasColumn('users', 'account_status')) await knex.schema.alterTable('users', t => t.dropColumn('account_status'));
};
