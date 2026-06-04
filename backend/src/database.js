const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'database.sqlite');

// Ensure database directory exists
const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err.message);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
    initializeDatabase();
  }
});

// Helper functions for modern async/await syntax
const query = {
  run(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID, changes: this.changes });
      });
    });
  },

  get(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  },

  all(sql, params = []) {
    return new Promise((resolve, reject) => {
      db.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }
};

function initializeDatabase() {
  db.serialize(async () => {
    try {
      // 1. Create users table
      await query.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          email TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT CHECK(role IN ('personal', 'student')) NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // 2. Create student_profiles table
      await query.run(`
        CREATE TABLE IF NOT EXISTS student_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER UNIQUE NOT NULL,
          personal_id INTEGER NOT NULL,
          height REAL,
          target_weight REAL,
          birth_date TEXT,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (personal_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // 3. Create workouts table
      await query.run(`
        CREATE TABLE IF NOT EXISTS workouts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          personal_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (personal_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // 4. Create workout_exercises table
      await query.run(`
        CREATE TABLE IF NOT EXISTS workout_exercises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workout_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          sets INTEGER NOT NULL,
          reps TEXT NOT NULL,
          weight TEXT,
          rest_time TEXT,
          notes TEXT,
          FOREIGN KEY (workout_id) REFERENCES workouts(id) ON DELETE CASCADE
        )
      `);

      // 4.1. Create exercises table
      await query.run(`
        CREATE TABLE IF NOT EXISTS exercises (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          personal_id INTEGER NOT NULL,
          name TEXT NOT NULL,
          gif_url TEXT,
          description TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (personal_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // 4.2. Alter workout_exercises to add exercise_id
      try {
        await query.run(`
          ALTER TABLE workout_exercises ADD COLUMN exercise_id INTEGER REFERENCES exercises(id) ON DELETE SET NULL
        `);
        console.log('Column exercise_id added successfully or already exists in workout_exercises.');
      } catch (err) {
        // Ignore "duplicate column name" error in SQLite
        if (!err.message.includes('duplicate column name') && !err.message.includes('already exists')) {
          console.error('Error adding exercise_id column:', err.message);
        }
      }

      // 5. Create measurements table
      await query.run(`
        CREATE TABLE IF NOT EXISTS measurements (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          student_id INTEGER NOT NULL,
          weight REAL NOT NULL,
          chest REAL,
          waist REAL,
          hips REAL,
          biceps_l REAL,
          biceps_r REAL,
          thigh_l REAL,
          thigh_r REAL,
          recorded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (student_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      // 6. Create chat_messages table
      await query.run(`
        CREATE TABLE IF NOT EXISTS chat_messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          sender_id INTEGER NOT NULL,
          receiver_id INTEGER NOT NULL,
          message TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          read_status INTEGER DEFAULT 0,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
          FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `);

      console.log('Database tables initialized successfully.');
    } catch (err) {
      console.error('Error initializing database tables:', err.message);
    }
  });
}

module.exports = {
  db,
  query
};
