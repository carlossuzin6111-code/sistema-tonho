exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('subscriptions'))) {
    await knex.schema.createTable('subscriptions', table => {
      table.increments('id').primary();
      table.integer('personal_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      table.string('plan', 64).notNullable().defaultTo('trial');
      table.string('status', 32).notNullable().defaultTo('trialing');
      table.string('provider_customer_id', 255).nullable();
      table.timestamp('current_period_end').notNullable();
      table.timestamp('grace_period_end').nullable();
      table.timestamps(true, true);
      table.index(['status', 'current_period_end'], 'subscriptions_status_expiry_idx');
    });
  }
  const personals = await knex('users').where('role', 'personal').select('id');
  const trialEnd = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  for (const personal of personals) {
    await knex('subscriptions').insert({ personal_id: personal.id, plan: 'trial', status: 'trialing', current_period_end: trialEnd }).onConflict('personal_id').ignore();
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('subscriptions');
};
