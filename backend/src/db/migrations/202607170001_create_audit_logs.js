exports.up = async function up(knex) {
  if (await knex.schema.hasTable('audit_logs')) return;

  await knex.schema.createTable('audit_logs', table => {
    table.increments('id').primary();
    table.integer('actor_user_id').references('id').inTable('users').onDelete('SET NULL');
    table.string('action', 100).notNullable();
    table.string('target_type', 50).notNullable();
    table.string('target_id', 100).notNullable();
    table.text('metadata');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.index(['actor_user_id', 'created_at'], 'audit_logs_actor_created_idx');
    table.index(['action', 'created_at'], 'audit_logs_action_created_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('audit_logs');
};
