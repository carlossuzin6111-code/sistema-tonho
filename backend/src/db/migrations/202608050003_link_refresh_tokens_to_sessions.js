exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('refresh_tokens', 'session_id'))) {
    await knex.schema.alterTable('refresh_tokens', table => {
      table.string('session_id', 64).nullable().references('id').inTable('user_sessions').onDelete('SET NULL');
      table.index(['user_id', 'session_id'], 'refresh_tokens_user_session_idx');
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn('refresh_tokens', 'session_id')) {
    await knex.schema.alterTable('refresh_tokens', table => table.dropColumn('session_id'));
  }
};
