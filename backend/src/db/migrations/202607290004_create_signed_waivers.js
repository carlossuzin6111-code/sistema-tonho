exports.up = async function up(knex) {
  if (await knex.schema.hasTable('signed_waivers')) return;
  await knex.schema.createTable('signed_waivers', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('terms_version', 64).notNullable();
    table.text('parq_answers').notNullable();
    table.string('ip_address', 64).notNullable();
    table.timestamp('signed_at').notNullable().defaultTo(knex.fn.now());
    table.unique(['user_id', 'terms_version']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('signed_waivers');
};
