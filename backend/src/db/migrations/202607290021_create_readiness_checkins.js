exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('readiness_checkins'))) {
    await knex.schema.createTable('readiness_checkins', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('date_key', 10).notNullable();
      table.integer('doms').notNullable();
      table.integer('sleep_quality').notNullable();
      table.integer('fatigue').notNullable();
      table.integer('mood').notNullable();
      table.float('readiness_score').notNullable();
      table.text('notes');
      table.timestamps(true, true);
      table.unique(['student_id', 'date_key'], 'readiness_student_day_unique');
      table.index(['student_id', 'date_key'], 'readiness_student_history_idx');
    });
  }
  for (const [name, column] of [['readiness_doms_range', 'doms'], ['readiness_sleep_range', 'sleep_quality'], ['readiness_fatigue_range', 'fatigue'], ['readiness_mood_range', 'mood']]) {
    await knex.raw(`CREATE TRIGGER IF NOT EXISTS ${name}_insert_check BEFORE INSERT ON readiness_checkins WHEN NEW.${column} NOT BETWEEN 1 AND 5 BEGIN SELECT RAISE(ABORT, 'readiness values must be between 1 and 5'); END;`);
    await knex.raw(`CREATE TRIGGER IF NOT EXISTS ${name}_update_check BEFORE UPDATE OF ${column} ON readiness_checkins WHEN NEW.${column} NOT BETWEEN 1 AND 5 BEGIN SELECT RAISE(ABORT, 'readiness values must be between 1 and 5'); END;`);
  }
};

exports.down = async function down(knex) {
  for (const name of ['readiness_doms_range', 'readiness_sleep_range', 'readiness_fatigue_range', 'readiness_mood_range']) {
    await knex.raw(`DROP TRIGGER IF EXISTS ${name}_insert_check`);
    await knex.raw(`DROP TRIGGER IF EXISTS ${name}_update_check`);
  }
  await knex.schema.dropTableIfExists('readiness_checkins');
};
