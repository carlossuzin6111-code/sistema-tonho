exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'avatar_filename'))) {
    await knex.schema.alterTable('users', table => {
      table.string('avatar_filename');
    });
  }
  if (!(await knex.schema.hasColumn('users', 'avatar_updated_at'))) {
    await knex.schema.alterTable('users', table => {
      table.timestamp('avatar_updated_at');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('users', 'avatar_updated_at')) {
    await knex.schema.alterTable('users', table => table.dropColumn('avatar_updated_at'));
  }
  if (await knex.schema.hasColumn('users', 'avatar_filename')) {
    await knex.schema.alterTable('users', table => table.dropColumn('avatar_filename'));
  }
};
