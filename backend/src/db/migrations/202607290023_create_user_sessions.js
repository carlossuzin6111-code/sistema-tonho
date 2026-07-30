exports.up = async function up(knex) {
  if (await knex.schema.hasTable('user_sessions')) return;
  await knex.schema.createTable('user_sessions', table => {
    table.string('id', 64).primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('device_name', 120).notNullable().defaultTo('Unknown device');
    table.string('user_agent', 500);
    table.string('ip_address', 64);
    table.string('status', 20).notNullable().defaultTo('active');
    table.timestamp('last_seen_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('revoked_at');
    table.timestamps(true, true);
    table.index(['user_id', 'status', 'last_seen_at'], 'user_sessions_user_status_idx');
  });
};

exports.down = async function down(knex) { await knex.schema.dropTableIfExists('user_sessions'); };
