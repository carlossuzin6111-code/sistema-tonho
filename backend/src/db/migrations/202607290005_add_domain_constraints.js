exports.up = async function up(knex) {
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS measurements_domain_check_insert
    BEFORE INSERT ON measurements
    WHEN NEW.weight <= 0 OR NEW.chest < 0 OR NEW.waist < 0 OR NEW.hips < 0 OR NEW.biceps_l < 0 OR NEW.biceps_r < 0 OR NEW.thigh_l < 0 OR NEW.thigh_r < 0
    BEGIN SELECT RAISE(ABORT, 'measurement values must be non-negative and weight must be positive'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS measurements_domain_check_update
    BEFORE UPDATE OF weight, chest, waist, hips, biceps_l, biceps_r, thigh_l, thigh_r ON measurements
    WHEN NEW.weight <= 0 OR NEW.chest < 0 OR NEW.waist < 0 OR NEW.hips < 0 OR NEW.biceps_l < 0 OR NEW.biceps_r < 0 OR NEW.thigh_l < 0 OR NEW.thigh_r < 0
    BEGIN SELECT RAISE(ABORT, 'measurement values must be non-negative and weight must be positive'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS workout_exercises_domain_check_insert
    BEFORE INSERT ON workout_exercises WHEN NEW.sets <= 0
    BEGIN SELECT RAISE(ABORT, 'workout exercise sets must be positive'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS workout_exercises_domain_check_update
    BEFORE UPDATE OF sets ON workout_exercises WHEN NEW.sets <= 0
    BEGIN SELECT RAISE(ABORT, 'workout exercise sets must be positive'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS workouts_domain_check_insert
    BEFORE INSERT ON workouts
    WHEN trim(NEW.name) = '' OR NEW.student_id <= 0 OR NEW.personal_id <= 0
    BEGIN SELECT RAISE(ABORT, 'workout identity and name are required'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS chat_messages_domain_check_insert
    BEFORE INSERT ON chat_messages WHEN trim(NEW.message) = ''
    BEGIN SELECT RAISE(ABORT, 'chat message cannot be empty'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS workout_sessions_status_check_insert
    BEFORE INSERT ON workout_sessions WHEN NEW.status NOT IN ('in_progress', 'completed', 'cancelled')
    BEGIN SELECT RAISE(ABORT, 'invalid workout session status'); END`);
  await knex.raw(`CREATE TRIGGER IF NOT EXISTS workout_sessions_status_check_update
    BEFORE UPDATE OF status ON workout_sessions WHEN NEW.status NOT IN ('in_progress', 'completed', 'cancelled')
    BEGIN SELECT RAISE(ABORT, 'invalid workout session status'); END`);
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS measurements_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS measurements_domain_check_update');
  await knex.raw('DROP TRIGGER IF EXISTS workout_exercises_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS workout_exercises_domain_check_update');
  await knex.raw('DROP TRIGGER IF EXISTS workouts_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS chat_messages_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS workout_sessions_status_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS workout_sessions_status_check_update');
};
