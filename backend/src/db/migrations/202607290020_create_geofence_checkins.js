exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('gym_geofences'))) {
    await knex.schema.createTable('gym_geofences', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name', 120).notNullable();
      table.float('latitude').notNullable();
      table.float('longitude').notNullable();
      table.integer('radius_meters').notNullable().defaultTo(150);
      table.boolean('active').notNullable().defaultTo(true);
      table.timestamps(true, true);
      table.index(['personal_id', 'active'], 'geofence_personal_active_idx');
    });
  }

  if (!(await knex.schema.hasTable('student_checkins'))) {
    await knex.schema.createTable('student_checkins', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('geofence_id').notNullable().references('id').inTable('gym_geofences').onDelete('CASCADE');
      table.string('client_event_id', 160).notNullable();
      table.float('latitude').notNullable();
      table.float('longitude').notNullable();
      table.integer('distance_meters').notNullable();
      table.string('status', 20).notNullable().defaultTo('active');
      table.timestamp('checked_in_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('checked_out_at');
      table.timestamps(true, true);
      table.unique(['student_id', 'client_event_id'], 'checkin_client_event_unique');
      table.index(['personal_id', 'student_id', 'checked_in_at'], 'checkin_personal_student_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('student_checkins');
  await knex.schema.dropTableIfExists('gym_geofences');
};
