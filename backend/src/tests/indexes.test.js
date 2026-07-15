const knex = require('knex');
const config = require('../../knexfile');

const baselineMigration = '202607140001_initial_schema.js';
const indexesMigration = '202607140002_add_query_indexes.js';

const queryPlans = [
  {
    index: 'student_profiles_personal_student_idx',
    sql: 'SELECT * FROM student_profiles WHERE personal_id = ? ORDER BY student_id',
    bindings: [1]
  },
  {
    index: 'measurements_student_recorded_idx',
    sql: 'SELECT * FROM measurements WHERE student_id = ? ORDER BY recorded_at DESC',
    bindings: [1]
  },
  {
    index: 'workouts_student_created_idx',
    sql: 'SELECT * FROM workouts WHERE student_id = ? ORDER BY created_at DESC',
    bindings: [1]
  },
  {
    index: 'workout_exercises_workout_id_idx',
    sql: 'SELECT * FROM workout_exercises WHERE workout_id = ? ORDER BY id ASC',
    bindings: [1]
  },
  {
    index: 'exercises_personal_name_idx',
    sql: 'SELECT * FROM exercises WHERE personal_id = ? ORDER BY name ASC',
    bindings: [1]
  },
  {
    index: 'chat_messages_participants_created_idx',
    sql: 'SELECT * FROM chat_messages WHERE sender_id = ? AND receiver_id = ? ORDER BY created_at ASC',
    bindings: [1, 2]
  }
];

async function explain(db, query) {
  const rows = await db.raw(`EXPLAIN QUERY PLAN ${query.sql}`, query.bindings);
  return rows.map(row => row.detail).join(' | ');
}

describe('query indexes migration', () => {
  let db;

  beforeEach(async () => {
    db = knex(config.test);
    await db.migrate.up({ name: baselineMigration });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test('replaces full table scans with the intended indexes', async () => {
    const plansBefore = await Promise.all(queryPlans.map(query => explain(db, query)));
    expect(plansBefore.every(plan => plan.includes('SCAN'))).toBe(true);

    await db.migrate.up({ name: indexesMigration });

    for (const query of queryPlans) {
      const plan = await explain(db, query);
      expect(plan).toContain(query.index);
      expect(plan).not.toContain('USE TEMP B-TREE FOR ORDER BY');
    }
  });

  test('removes every added index on rollback', async () => {
    await db.migrate.up({ name: indexesMigration });
    await db.migrate.down({ name: indexesMigration });

    for (const query of queryPlans) {
      const plan = await explain(db, query);
      expect(plan).not.toContain(query.index);
    }
  });
});
