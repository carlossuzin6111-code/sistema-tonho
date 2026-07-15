exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
      table.string('email').unique().notNullable();
      table.string('password_hash').notNullable();
      table.string('role').notNullable();
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('student_profiles'))) {
    await knex.schema.createTable('student_profiles', table => {
      table.increments('id').primary();
      table.integer('student_id').unique().notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.float('height');
      table.float('target_weight');
      table.string('birth_date');
    });
  }

  if (!(await knex.schema.hasTable('workouts'))) {
    await knex.schema.createTable('workouts', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.text('description');
      table.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('exercises'))) {
    await knex.schema.createTable('exercises', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('name').notNullable();
      table.string('gif_url');
      table.text('description');
      table.boolean('is_translated').defaultTo(false);
      table.timestamps(true, true);
    });
  } else if (!(await knex.schema.hasColumn('exercises', 'is_translated'))) {
    await knex.schema.alterTable('exercises', table => {
      table.boolean('is_translated').defaultTo(false);
    });
  }

  if (!(await knex.schema.hasTable('workout_exercises'))) {
    await knex.schema.createTable('workout_exercises', table => {
      table.increments('id').primary();
      table.integer('workout_id').notNullable().references('id').inTable('workouts').onDelete('CASCADE');
      table.integer('exercise_id').references('id').inTable('exercises').onDelete('SET NULL');
      table.string('name').notNullable();
      table.integer('sets').notNullable();
      table.string('reps').notNullable();
      table.string('weight');
      table.string('rest_time');
      table.text('notes');
    });
  }

  if (!(await knex.schema.hasTable('measurements'))) {
    await knex.schema.createTable('measurements', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.float('weight').notNullable();
      table.float('chest');
      table.float('waist');
      table.float('hips');
      table.float('biceps_l');
      table.float('biceps_r');
      table.float('thigh_l');
      table.float('thigh_r');
      table.timestamp('recorded_at').defaultTo(knex.fn.now());
    });
  }

  if (!(await knex.schema.hasTable('chat_messages'))) {
    await knex.schema.createTable('chat_messages', table => {
      table.increments('id').primary();
      table.integer('sender_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('receiver_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.text('message').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.integer('read_status').defaultTo(0);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('chat_messages');
  await knex.schema.dropTableIfExists('measurements');
  await knex.schema.dropTableIfExists('workout_exercises');
  await knex.schema.dropTableIfExists('exercises');
  await knex.schema.dropTableIfExists('workouts');
  await knex.schema.dropTableIfExists('student_profiles');
  await knex.schema.dropTableIfExists('users');
};
