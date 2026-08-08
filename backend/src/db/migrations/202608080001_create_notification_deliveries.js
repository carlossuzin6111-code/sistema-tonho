exports.up = async function up(knex) {
  if (await knex.schema.hasTable('notification_deliveries')) return;
  await knex.schema.createTable('notification_deliveries', table => {
    table.increments('id').primary();
    table.integer('notification_id').notNullable().unique().references('id').inTable('notifications').onDelete('CASCADE');
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('channel', 20).notNullable();
    table.string('status', 20).notNullable().defaultTo('pending');
    table.integer('attempt_count').notNullable().defaultTo(0);
    table.timestamp('next_attempt_at').notNullable().defaultTo(knex.fn.now());
    table.timestamp('locked_at');
    table.timestamp('delivered_at');
    table.string('last_error', 240);
    table.timestamps(true, true);
    table.index(['status', 'next_attempt_at'], 'notification_delivery_queue_idx');
    table.index(['user_id', 'status'], 'notification_delivery_user_status_idx');
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notification_deliveries');
};
