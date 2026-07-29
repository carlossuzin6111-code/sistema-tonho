const crypto = require('crypto');

exports.up = async function up(knex) {
  if (await knex.schema.hasTable('student_invitations')) return;
  await knex.schema.createTable('student_invitations', table => {
    table.increments('id').primary();
    table.string('email', 254).notNullable();
    table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('token_hash', 64).notNullable().unique();
    table.timestamp('expires_at').notNullable();
    table.timestamp('claimed_at').nullable();
    table.timestamps(true, true);
    table.unique(['email', 'personal_id']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('student_invitations');
};

exports.hashToken = token => crypto.createHash('sha256').update(token).digest('hex');
