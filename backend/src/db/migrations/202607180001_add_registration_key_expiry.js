const LEGACY_KEY_GRACE_DAYS = 30;

exports.up = async function up(knex) {
  await knex.schema.alterTable('registration_keys', table => {
    table.timestamp('expires_at');
    table.index(['expires_at'], 'registration_keys_expires_at_idx');
  });

  await knex('registration_keys')
    .whereNull('used_at')
    .whereNull('expires_at')
    .update({
      expires_at: knex.raw(`datetime('now', '+${LEGACY_KEY_GRACE_DAYS} days')`)
    });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('registration_keys', table => {
    table.dropIndex(['expires_at'], 'registration_keys_expires_at_idx');
    table.dropColumn('expires_at');
  });
};
