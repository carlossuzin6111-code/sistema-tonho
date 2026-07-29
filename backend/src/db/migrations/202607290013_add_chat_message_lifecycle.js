exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('chat_messages'))) return;
  const hasEdited = await knex.schema.hasColumn('chat_messages', 'edited_at');
  const hasDeleted = await knex.schema.hasColumn('chat_messages', 'deleted_at');
  if (!hasEdited || !hasDeleted) {
    await knex.schema.alterTable('chat_messages', table => {
      if (!hasEdited) table.timestamp('edited_at');
      if (!hasDeleted) table.timestamp('deleted_at');
      table.index(['deleted_at'], 'chat_messages_deleted_at_idx');
    });
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable('chat_messages'))) return;
  await knex.schema.alterTable('chat_messages', table => {
    table.dropIndex(['deleted_at'], 'chat_messages_deleted_at_idx');
    table.dropColumn('edited_at');
    table.dropColumn('deleted_at');
  });
};
