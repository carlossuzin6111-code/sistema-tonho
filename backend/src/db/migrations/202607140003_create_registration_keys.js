exports.up = async function up(knex) {
  await knex.schema.createTable('registration_keys', table => {
    table.increments('id').primary();
    table.string('key_hash', 64).unique().notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('used_at');
    table.integer('used_by').references('id').inTable('users').onDelete('SET NULL');
    table.index(['used_at'], 'registration_keys_used_at_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('registration_keys');
};
