const path = require('path');

const migrations = {
  directory: path.join(__dirname, 'src', 'db', 'migrations')
};

const sqlitePool = {
  afterCreate(connection, done) {
    connection.exec(
      'PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
      error => done(error, connection)
    );
  }
};

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite')
    },
    useNullAsDefault: true,
    pool: sqlitePool,
    migrations,
    seeds: {
      directory: path.join(__dirname, 'src', 'db', 'seeds')
    }
  },
  test: {
    client: 'sqlite3',
    connection: {
      filename: ':memory:'
    },
    useNullAsDefault: true,
    pool: sqlitePool,
    migrations
  },
  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || '/app/data/database.sqlite'
    },
    useNullAsDefault: true,
    pool: sqlitePool,
    migrations
  }
};
