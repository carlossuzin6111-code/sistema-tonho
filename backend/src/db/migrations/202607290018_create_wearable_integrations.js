exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('wearable_connections'))) {
    await knex.schema.createTable('wearable_connections', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('provider', 40).notNullable();
      table.string('external_account_id', 160);
      // Store only a server-side reference. OAuth access/refresh tokens must be
      // kept in a secrets manager by a provider adapter, never in SQLite.
      table.string('credential_ref', 255);
      table.text('scopes').notNullable().defaultTo('[]');
      table.string('status', 20).notNullable().defaultTo('pending');
      table.timestamp('last_synced_at');
      table.timestamps(true, true);
      table.unique(['student_id', 'provider', 'external_account_id'], 'wearable_connection_account_unique');
      table.index(['student_id', 'status'], 'wearable_connection_student_status_idx');
    });
  }

  if (!(await knex.schema.hasTable('wearable_metrics'))) {
    await knex.schema.createTable('wearable_metrics', table => {
      table.increments('id').primary();
      table.integer('connection_id').notNullable().references('id').inTable('wearable_connections').onDelete('CASCADE');
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('metric_type', 20).notNullable();
      table.timestamp('observed_at').notNullable();
      table.float('value').notNullable();
      table.string('unit', 20).notNullable();
      table.string('source_event_id', 180).notNullable();
      table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
      table.unique(['connection_id', 'source_event_id'], 'wearable_metric_event_unique');
      table.index(['student_id', 'metric_type', 'observed_at'], 'wearable_metric_history_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('wearable_metrics');
  await knex.schema.dropTableIfExists('wearable_connections');
};
