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
};

exports.down = async function down(knex) {
  await knex.raw('DROP TRIGGER IF EXISTS measurements_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS measurements_domain_check_update');
  await knex.raw('DROP TRIGGER IF EXISTS workout_exercises_domain_check_insert');
  await knex.raw('DROP TRIGGER IF EXISTS workout_exercises_domain_check_update');
};
