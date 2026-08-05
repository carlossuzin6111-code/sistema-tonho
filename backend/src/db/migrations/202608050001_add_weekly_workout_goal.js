exports.up = async function up(knex) {
  if (await knex.schema.hasTable('student_profiles') && !(await knex.schema.hasColumn('student_profiles', 'weekly_workout_goal'))) {
    await knex.schema.alterTable('student_profiles', table => table.integer('weekly_workout_goal').notNullable().defaultTo(3));
  }
  await knex.raw("CREATE TRIGGER IF NOT EXISTS student_weekly_goal_insert_check BEFORE INSERT ON student_profiles WHEN NEW.weekly_workout_goal < 1 OR NEW.weekly_workout_goal > 14 BEGIN SELECT RAISE(ABORT, 'weekly workout goal must be between 1 and 14'); END;");
  await knex.raw("CREATE TRIGGER IF NOT EXISTS student_weekly_goal_update_check BEFORE UPDATE OF weekly_workout_goal ON student_profiles WHEN NEW.weekly_workout_goal < 1 OR NEW.weekly_workout_goal > 14 BEGIN SELECT RAISE(ABORT, 'weekly workout goal must be between 1 and 14'); END;");
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS student_weekly_goal_insert_check');
  await knex.raw('DROP TRIGGER IF EXISTS student_weekly_goal_update_check');
  if (await knex.schema.hasTable('student_profiles') && await knex.schema.hasColumn('student_profiles', 'weekly_workout_goal')) {
    await knex.schema.alterTable('student_profiles', table => table.dropColumn('weekly_workout_goal'));
  }
};
