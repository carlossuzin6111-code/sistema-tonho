const indexes = [
  {
    table: 'student_profiles',
    columns: ['personal_id', 'student_id'],
    name: 'student_profiles_personal_student_idx'
  },
  {
    table: 'measurements',
    columns: ['student_id', 'recorded_at'],
    name: 'measurements_student_recorded_idx'
  },
  {
    table: 'workouts',
    columns: ['student_id', 'created_at'],
    name: 'workouts_student_created_idx'
  },
  {
    table: 'workout_exercises',
    columns: ['workout_id', 'id'],
    name: 'workout_exercises_workout_id_idx'
  },
  {
    table: 'exercises',
    columns: ['personal_id', 'name'],
    name: 'exercises_personal_name_idx'
  },
  {
    table: 'chat_messages',
    columns: ['sender_id', 'receiver_id', 'created_at'],
    name: 'chat_messages_participants_created_idx'
  }
];

exports.up = async function up(knex) {
  for (const index of indexes) {
    await knex.schema.alterTable(index.table, table => {
      table.index(index.columns, index.name);
    });
  }
};

exports.down = async function down(knex) {
  for (const index of [...indexes].reverse()) {
    await knex.schema.alterTable(index.table, table => {
      table.dropIndex(index.columns, index.name);
    });
  }
};
