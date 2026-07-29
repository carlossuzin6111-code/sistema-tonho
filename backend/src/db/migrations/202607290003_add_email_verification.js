exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('users', 'email_verified_at'))) {
    await knex.schema.alterTable('users', table => table.timestamp('email_verified_at').nullable());
  }
  if (!(await knex.schema.hasTable('email_verification_tokens'))) {
    await knex.schema.createTable('email_verification_tokens', table => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('token_hash', 64).notNullable().unique();
      table.timestamp('expires_at').notNullable();
      table.timestamp('used_at').nullable();
      table.timestamps(true, true);
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('email_verification_tokens');
  if (await knex.schema.hasColumn('users', 'email_verified_at')) {
    await knex.schema.alterTable('users', table => table.dropColumn('email_verified_at'));
  }
};
