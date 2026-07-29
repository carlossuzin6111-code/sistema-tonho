exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'must_change_password'))) {
    await knex.schema.alterTable('users', table => {
      table.boolean('must_change_password').notNullable().defaultTo(false);
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('users', 'must_change_password')) {
    await knex.schema.alterTable('users', table => table.dropColumn('must_change_password'));
  }
};
