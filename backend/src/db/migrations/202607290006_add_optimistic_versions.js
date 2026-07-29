exports.up = async function up(knex) {
  for (const tableName of ['users', 'workouts', 'workout_exercises', 'exercises']) {
    if (await knex.schema.hasTable(tableName) && !(await knex.schema.hasColumn(tableName, 'version'))) {
      await knex.schema.alterTable(tableName, table => table.integer('version').notNullable().defaultTo(1));
    }
  }
};

exports.down = async function down(knex) {
  for (const tableName of ['users', 'workouts', 'workout_exercises', 'exercises']) {
    if (await knex.schema.hasTable(tableName) && await knex.schema.hasColumn(tableName, 'version')) {
      await knex.schema.alterTable(tableName, table => table.dropColumn('version'));
    }
  }
};
