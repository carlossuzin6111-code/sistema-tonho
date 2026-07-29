exports.up = async function up(knex) {
  if (await knex.schema.hasTable('idempotency_keys')) return;
  await knex.schema.createTable('idempotency_keys', table => {
    table.string('key', 100).primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('response_status').notNullable();
    table.text('response_body').notNullable();
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['user_id', 'created_at'], 'idx_idempotency_user_created');
  });
};

exports.down = async function down(knex) { await knex.schema.dropTableIfExists('idempotency_keys'); };
