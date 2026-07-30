exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('notification_preferences'))) {
    await knex.schema.createTable('notification_preferences', table => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('event_type', 60).notNullable();
      table.string('channel', 20).notNullable();
      table.boolean('enabled').notNullable().defaultTo(true);
      table.timestamps(true, true);
      table.unique(['user_id', 'event_type', 'channel'], 'notification_preference_unique');
      table.index(['user_id', 'enabled'], 'notification_preference_user_idx');
    });
  }
  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', table => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('event_type', 60).notNullable();
      table.string('channel', 20).notNullable();
      table.string('title', 180).notNullable();
      table.text('body').notNullable();
      table.string('status', 20).notNullable().defaultTo('unread');
      table.string('dedupe_key', 180);
      table.timestamp('read_at');
      table.timestamps(true, true);
      table.unique(['user_id', 'channel', 'dedupe_key'], 'notification_dedupe_unique');
      table.index(['user_id', 'status', 'created_at'], 'notification_user_status_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('notifications');
  await knex.schema.dropTableIfExists('notification_preferences');
};
