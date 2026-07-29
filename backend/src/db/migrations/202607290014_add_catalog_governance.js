exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('exercises'))) return;
  const hasScope = await knex.schema.hasColumn('exercises', 'catalog_scope');
  if (!hasScope) {
    await knex.schema.alterTable('exercises', table => {
      table.string('catalog_scope', 16).notNullable().defaultTo('global');
      table.string('canonical_name', 200);
      table.timestamp('archived_at').nullable();
    });
  }
  await knex('exercises').update({ canonical_name: knex.raw('lower(trim(name))') });
  await knex('exercises').where({ is_custom: 1 }).update({ catalog_scope: 'custom' });
  await knex.schema.alterTable('exercises', table => {
    table.index(['catalog_scope', 'canonical_name'], 'exercises_catalog_governance_idx');
    table.index(['personal_id', 'canonical_name'], 'exercises_personal_canonical_idx');
  });
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable('exercises')) {
    await knex.schema.alterTable('exercises', table => {
      table.dropColumn('catalog_scope');
      table.dropColumn('canonical_name');
      table.dropColumn('archived_at');
    });
  }
};
