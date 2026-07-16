exports.up = async function up(knex) {
  const duplicates = await knex('users')
    .select(knex.raw('LOWER(TRIM(email)) AS normalized_email'))
    .count({ count: '*' })
    .groupByRaw('LOWER(TRIM(email))')
    .havingRaw('COUNT(*) > 1');

  if (duplicates.length > 0) {
    throw new Error('Cannot normalize user emails while case-insensitive duplicates exist');
  }

  await knex('users').update({ email: knex.raw('LOWER(TRIM(email))') });
  await knex.raw(
    'CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalized_unique ON users (LOWER(TRIM(email)))'
  );
};

exports.down = async function down(knex) {
  await knex.raw('DROP INDEX IF EXISTS users_email_normalized_unique');
};
