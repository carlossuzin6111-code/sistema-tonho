exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn('idempotency_keys', 'request_fingerprint'))) {
    await knex.schema.alterTable('idempotency_keys', table => {
      table.string('request_method', 10).nullable();
      table.string('request_path', 255).nullable();
      table.string('request_fingerprint', 64).nullable();
    });
  }
};

exports.down = async function down(knex) {
  for (const column of ['request_fingerprint', 'request_path', 'request_method']) {
    if (await knex.schema.hasColumn('idempotency_keys', column)) {
      await knex.schema.alterTable('idempotency_keys', table => table.dropColumn(column));
    }
  }
};
