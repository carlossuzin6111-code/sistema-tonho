exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('subscriptions'))) {
    await knex.schema.createTable('subscriptions', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('status', 20).notNullable().defaultTo('trial');
      table.string('provider', 40).notNullable().defaultTo('internal');
      table.string('external_id', 200).nullable();
      table.timestamp('current_period_start').notNullable();
      table.timestamp('current_period_end').notNullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());
      table.unique(['personal_id', 'status'], 'subscriptions_personal_status_unique');
      table.index(['personal_id', 'current_period_end'], 'subscriptions_expiry_idx');
    });
  }
  const personals = await knex('users').select('id').where('role', 'personal');
  const start = new Date().toISOString();
  const end = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  for (const personal of personals) {
    await knex('subscriptions').insert({ personal_id: personal.id, status: 'trial', provider: 'internal', current_period_start: start, current_period_end: end }).onConflict(['personal_id', 'status']).ignore();
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('subscriptions');
};
