exports.up = async function up(knex) {
  if (await knex.schema.hasTable('refresh_tokens')) return;
  await knex.schema.createTable('refresh_tokens', table => {
    table.string('id', 64).primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 64).notNullable().unique();
    table.string('family_id', 64).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('used_at');
    table.timestamp('revoked_at');
    table.timestamps(true, true);
    table.index(['user_id', 'family_id']);
  });
};

exports.down = async function down(knex) { await knex.schema.dropTableIfExists('refresh_tokens'); };
