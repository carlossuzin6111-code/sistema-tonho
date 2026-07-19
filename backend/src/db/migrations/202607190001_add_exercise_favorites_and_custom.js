exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable('exercises');
  if (hasTable) {
    const hasIsFavorite = await knex.schema.hasColumn('exercises', 'is_favorite');
    if (!hasIsFavorite) {
      await knex.schema.alterTable('exercises', table => {
        table.boolean('is_favorite').defaultTo(false);
        table.timestamp('favorited_at').nullable();
        table.integer('display_order').nullable();
        table.boolean('is_custom').defaultTo(false);
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable('exercises');
  if (hasTable) {
    await knex.schema.alterTable('exercises', table => {
      table.dropColumn('is_favorite');
      table.dropColumn('favorited_at');
      table.dropColumn('display_order');
      table.dropColumn('is_custom');
    });
  }
};
