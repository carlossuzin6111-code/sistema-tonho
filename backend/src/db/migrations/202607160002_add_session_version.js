exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'session_version'))) {
    await knex.schema.alterTable('users', table => {
      table.integer('session_version').notNullable().defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('users', 'session_version')) {
    await knex.schema.alterTable('users', table => {
      table.dropColumn('session_version');
    });
  }
};
