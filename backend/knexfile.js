const path = require('path');

const migrations = {
  directory: path.join(__dirname, 'src', 'db', 'migrations')
};

module.exports = {
  development: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || path.join(__dirname, 'data', 'database.sqlite')
    },
    useNullAsDefault: true,
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
    migrations
  },
  production: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || '/app/data/database.sqlite'
    },
    useNullAsDefault: true,
    migrations
  }
};
