exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('professional_partners'))) {
    await knex.schema.createTable('professional_partners', table => {
      table.increments('id').primary();
      table.integer('user_id').notNullable().unique().references('id').inTable('users').onDelete('CASCADE');
      table.string('specialty', 120).notNullable();
      table.string('organization', 200);
      table.string('status', 16).notNullable().defaultTo('active');
      table.timestamps(true, true);
    });
  }
  if (!(await knex.schema.hasTable('student_partner_consents'))) {
    await knex.schema.createTable('student_partner_consents', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('partner_id').notNullable().references('id').inTable('professional_partners').onDelete('CASCADE');
      table.text('scopes').notNullable();
      table.string('status', 16).notNullable().defaultTo('active');
      table.timestamp('expires_at').nullable();
      table.timestamp('revoked_at').nullable();
      table.timestamps(true, true);
      table.unique(['student_id', 'partner_id']);
      table.index(['partner_id', 'status'], 'partner_consents_partner_status_idx');
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('student_partner_consents');
  await knex.schema.dropTableIfExists('professional_partners');
};
