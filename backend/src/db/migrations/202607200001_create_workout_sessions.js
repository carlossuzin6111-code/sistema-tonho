exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('workout_sessions'))) {
    await knex.schema.createTable('workout_sessions', table => {
      table.increments('id').primary();
      table.integer('workout_id').references('id').inTable('workouts').onDelete('SET NULL');
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('workout_name').notNullable();
      table.string('status').notNullable().defaultTo('in_progress');
      table.timestamp('started_at').defaultTo(knex.fn.now());
      table.timestamp('completed_at');
      table.integer('duration_seconds');
      table.text('notes');
      table.timestamps(true, true);
    });

    await knex.schema.alterTable('workout_sessions', table => {
      table.index(['student_id', 'started_at'], 'idx_workout_sessions_student');
      table.index(['personal_id', 'started_at'], 'idx_workout_sessions_personal');
    });
  }

  if (!(await knex.schema.hasTable('workout_session_exercises'))) {
    await knex.schema.createTable('workout_session_exercises', table => {
      table.increments('id').primary();
      table.integer('session_id').notNullable().references('id').inTable('workout_sessions').onDelete('CASCADE');
      table.integer('workout_exercise_id').references('id').inTable('workout_exercises').onDelete('SET NULL');
      table.string('exercise_name').notNullable();
      table.integer('sets_completed').notNullable().defaultTo(0);
      table.integer('sets_target').notNullable();
      table.string('reps_target');
      table.string('weight_used');
      table.string('rest_time');
      table.boolean('completed').notNullable().defaultTo(false);
      table.text('notes');
    });

    await knex.schema.alterTable('workout_session_exercises', table => {
      table.index(['session_id'], 'idx_workout_session_exercises_session');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('workout_session_exercises');
  await knex.schema.dropTableIfExists('workout_sessions');
};
