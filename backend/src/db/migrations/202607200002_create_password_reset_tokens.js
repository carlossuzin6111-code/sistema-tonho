exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('password_reset_tokens'))) {
    await knex.schema.createTable('password_reset_tokens', table => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token_hash').notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.timestamp('used_at');
      table.timestamp('created_at').defaultTo(knex.fn.now());
    });

    await knex.schema.alterTable('password_reset_tokens', table => {
      table.index(['user_id'], 'idx_password_reset_tokens_user');
      table.index(['token_hash'], 'idx_password_reset_tokens_hash');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('password_reset_tokens');
};
