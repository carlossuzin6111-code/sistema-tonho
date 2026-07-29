exports.up = async function up(knex) {
  if (await knex.schema.hasTable('workout_microcycles')) return;
  await knex.schema.createTable('workout_microcycles', table => {
    table.increments('id').primary();
    table.integer('workout_id').notNullable().references('id').inTable('workouts').onDelete('CASCADE');
    table.integer('week_number').notNullable();
    table.string('label', 120).notNullable();
    table.float('intensity_percent').notNullable();
    table.float('volume_multiplier').notNullable();
    table.text('notes');
    table.timestamps(true, true);
    table.unique(['workout_id', 'week_number']);
    table.index(['workout_id', 'week_number'], 'workout_microcycles_workout_week_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('workout_microcycles');
};
