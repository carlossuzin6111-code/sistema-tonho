exports.up = async function up(knex) {
  await knex.schema.createTable('compliance_export_jobs', table => {
    table.increments('id').primary();
    table.integer('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    table.string('status', 20).notNullable().defaultTo('pending');
    table.string('file_path', 500);
    table.string('encryption_key_hash', 128);
    table.timestamp('expires_at').notNullable();
    table.timestamp('started_at');
    table.timestamp('completed_at');
    table.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
    table.text('error_message');
    table.index(['user_id', 'created_at']);
    table.index(['status', 'created_at']);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('compliance_export_jobs');
};
