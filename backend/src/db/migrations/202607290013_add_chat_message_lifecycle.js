exports.up = async function up(knex) {
  const hasEdited = await knex.schema.hasColumn('chat_messages', 'edited_at');
  const hasDeleted = await knex.schema.hasColumn('chat_messages', 'deleted_at');
  if (!hasEdited || !hasDeleted) {
    await knex.schema.alterTable('chat_messages', table => {
      if (!hasEdited) table.timestamp('edited_at').nullable();
      if (!hasDeleted) table.timestamp('deleted_at').nullable();
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('chat_messages', table => {
    table.dropColumn('edited_at');
    table.dropColumn('deleted_at');
  });
};
