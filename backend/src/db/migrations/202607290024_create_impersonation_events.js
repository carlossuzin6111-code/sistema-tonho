exports.up = async function up(knex) {
  if (await knex.schema.hasTable('impersonation_events')) return;
  await knex.schema.createTable('impersonation_events', table => {
    table.string('id', 64).primary();
    table.integer('actor_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.integer('target_user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('reason', 500).notNullable();
    table.timestamp('expires_at').notNullable();
    table.timestamp('revoked_at');
    table.timestamps(true, true);
    table.index(['actor_user_id', 'created_at'], 'impersonation_actor_created_idx');
    table.index(['target_user_id', 'expires_at'], 'impersonation_target_expiry_idx');
  });
};

exports.down = async function down(knex) { await knex.schema.dropTableIfExists('impersonation_events'); };
