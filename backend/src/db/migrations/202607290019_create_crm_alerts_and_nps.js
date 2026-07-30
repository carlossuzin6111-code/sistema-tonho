exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('crm_alerts'))) {
    await knex.schema.createTable('crm_alerts', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('alert_type', 30).notNullable();
      table.integer('inactivity_days').notNullable();
      table.string('status', 20).notNullable().defaultTo('open');
      table.string('detected_on', 10).notNullable();
      table.timestamp('resolved_at');
      table.timestamps(true, true);
      table.unique(['personal_id', 'student_id', 'alert_type', 'detected_on'], 'crm_alert_daily_unique');
      table.index(['personal_id', 'status', 'created_at'], 'crm_alert_personal_status_idx');
    });
  }

  if (!(await knex.schema.hasTable('nps_surveys'))) {
    await knex.schema.createTable('nps_surveys', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('pending');
      table.integer('score');
      table.text('comment');
      table.timestamp('sent_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('responded_at');
      table.timestamps(true, true);
      table.index(['personal_id', 'status', 'sent_at'], 'nps_personal_status_idx');
      table.index(['student_id', 'status'], 'nps_student_status_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('nps_surveys');
  await knex.schema.dropTableIfExists('crm_alerts');
};
