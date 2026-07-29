exports.up = async function up(knex) {
  if (await knex.schema.hasTable('workouts') && !(await knex.schema.hasColumn('workouts', 'status'))) {
    await knex.schema.alterTable('workouts', table => table.string('status').notNullable().defaultTo('published'));
  }
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS workouts_status_insert_check
    BEFORE INSERT ON workouts
    WHEN NEW.status NOT IN ('draft', 'published', 'archived')
    BEGIN SELECT RAISE(ABORT, 'invalid workout status'); END;
  `);
  await knex.raw(`
    CREATE TRIGGER IF NOT EXISTS workouts_status_update_check
    BEFORE UPDATE OF status ON workouts
    WHEN NEW.status NOT IN ('draft', 'published', 'archived')
    BEGIN SELECT RAISE(ABORT, 'invalid workout status'); END;
  `);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS workouts_status_insert_check');
  await knex.raw('DROP TRIGGER IF EXISTS workouts_status_update_check');
  if (await knex.schema.hasTable('workouts') && await knex.schema.hasColumn('workouts', 'status')) {
    await knex.schema.alterTable('workouts', table => table.dropColumn('status'));
  }
};
