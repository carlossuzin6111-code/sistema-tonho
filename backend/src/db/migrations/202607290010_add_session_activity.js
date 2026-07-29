exports.up = async function up(knex) {
  if (await knex.schema.hasTable('workout_sessions') && !(await knex.schema.hasColumn('workout_sessions', 'last_activity_at'))) {
    await knex.schema.alterTable('workout_sessions', table => table.timestamp('last_activity_at'));
    await knex('workout_sessions').where({ status: 'in_progress' }).update({ last_activity_at: knex.fn.now() });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('workout_sessions') && await knex.schema.hasColumn('workout_sessions', 'last_activity_at')) await knex.schema.alterTable('workout_sessions', table => table.dropColumn('last_activity_at'));
};
