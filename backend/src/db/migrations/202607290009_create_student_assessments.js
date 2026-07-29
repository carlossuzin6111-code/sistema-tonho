exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable('student_assessments'))) {
    await knex.schema.createTable('student_assessments', table => {
      table.increments('id').primary();
      table.integer('student_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.integer('personal_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
      table.string('experience_level', 50).notNullable();
      table.text('anatomical_limitations');
      table.text('clinical_injuries');
      table.text('personal_notes');
      table.text('student_notes');
      table.timestamps(true, true);
      table.index(['student_id', 'created_at'], 'student_assessments_student_created_idx');
    });
  }
};

exports.down = async function down(knex) { await knex.schema.dropTableIfExists('student_assessments'); };
