exports.up = async function up(knex) {
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'organization_role'))) {
    await knex.schema.alterTable('users', table => table.string('organization_role', 16).notNullable().defaultTo('standalone'));
  }
  if (!(await knex.schema.hasTable('personal_team_memberships'))) {
    await knex.schema.createTable('personal_team_memberships', table => {
      table.increments('id').primary();
      table.integer('head_personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('junior_personal_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      table.decimal('revenue_share_percent', 5, 2).notNullable().defaultTo(0);
      table.string('status', 16).notNullable().defaultTo('active');
      table.timestamp('joined_at').notNullable().defaultTo(knex.fn.now());
      table.timestamp('ended_at').nullable();
      table.index(['head_personal_id', 'status'], 'team_memberships_head_status_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('personal_team_memberships');
  if (await knex.schema.hasTable('users') && await knex.schema.hasColumn('users', 'organization_role')) {
    await knex.schema.alterTable('users', table => table.dropColumn('organization_role'));
  }
};
