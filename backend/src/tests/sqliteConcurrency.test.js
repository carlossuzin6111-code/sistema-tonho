const fs = require('fs');
const os = require('os');
const path = require('path');
const knex = require('knex');
const config = require('../../knexfile');

function fileDatabase(filename) {
  return knex({
    ...config.production,
    connection: { filename }
  });
}

describe('SQLite connection concurrency configuration', () => {
  let directory;
  const databases = [];

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fitlife-sqlite-concurrency-'));
  });

  afterEach(async () => {
    await Promise.all(databases.splice(0).map(database => database.destroy()));
    fs.rmSync(directory, { recursive: true, force: true });
  });

  test('uses the same connection hook in every environment', () => {
    expect(config.development.pool.afterCreate).toBe(config.test.pool.afterCreate);
    expect(config.test.pool.afterCreate).toBe(config.production.pool.afterCreate);
  });

  test('enables WAL and a five-second busy timeout for a file database', async () => {
    const db = fileDatabase(path.join(directory, 'pragmas.sqlite'));
    databases.push(db);

    const journalMode = await db.raw('PRAGMA journal_mode;');
    const busyTimeout = await db.raw('PRAGMA busy_timeout;');

    expect(journalMode[0].journal_mode).toBe('wal');
    expect(busyTimeout[0].timeout).toBe(5000);
  });

  test('waits for a short write lock instead of failing immediately', async () => {
    const filename = path.join(directory, 'contention.sqlite');
    const first = fileDatabase(filename);
    const second = fileDatabase(filename);
    databases.push(first, second);

    await first.schema.createTable('items', table => {
      table.increments('id').primary();
      table.string('name').notNullable();
    });

    const transaction = await first.transaction();
    await transaction('items').insert({ name: 'first' });

    const competingWrite = second('items').insert({ name: 'second' });
    await new Promise(resolve => setTimeout(resolve, 100));
    await transaction.commit();

    await expect(competingWrite).resolves.toBeDefined();
    await expect(first('items').count({ count: '*' }).first()).resolves.toMatchObject({ count: 2 });
  });

  test('does not release a connection when pragma initialization fails', async () => {
    const expectedError = new Error('pragma failure');
    const connection = {
      exec(statement, callback) {
        expect(statement).toContain('PRAGMA journal_mode = WAL');
        expect(statement).toContain('PRAGMA busy_timeout = 5000');
        callback(expectedError);
      }
    };

    await new Promise(resolve => {
      config.production.pool.afterCreate(connection, (error, returnedConnection) => {
        expect(error).toBe(expectedError);
        expect(returnedConnection).toBe(connection);
        resolve();
      });
    });
  });
});
