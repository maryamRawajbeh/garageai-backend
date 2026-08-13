const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const dbPath = process.env.DB_PATH || path.join(__dirname, '../../data/garageai.db');
fs.mkdirSync(path.dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    email_notifications INTEGER NOT NULL DEFAULT 1,
    maintenance_reminders INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS analyses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    final_prediction TEXT NOT NULL,
    final_confidence REAL NOT NULL,
    all_probabilities TEXT,
    individual_models TEXT NOT NULL,
    processing_time_ms REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS password_resets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS diagnose_conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    messages TEXT NOT NULL,
    predicted_class TEXT,
    category_label TEXT,
    match_score REAL,
    severity TEXT,
    severity_reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- One row per issued JWT (identified by its "jti" claim), so a token can be
  -- revoked server-side (logout, password change) instead of just staying valid
  -- until it naturally expires -- a JWT alone can't be invalidated early.
  CREATE TABLE IF NOT EXISTS sessions (
    jti TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    revoked INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
  CREATE INDEX IF NOT EXISTS idx_password_resets_user_id ON password_resets(user_id);
  CREATE INDEX IF NOT EXISTS idx_diagnose_conversations_user_id ON diagnose_conversations(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`);

// CREATE TABLE IF NOT EXISTS above doesn't retroactively add columns to a database file
// that already existed before this column was introduced -- add it if missing.
const analysesColumns = db.prepare("PRAGMA table_info(analyses)").all().map((c) => c.name);
if (!analysesColumns.includes('all_probabilities')) {
  db.exec('ALTER TABLE analyses ADD COLUMN all_probabilities TEXT');
}

const diagnoseConversationsColumns = db
  .prepare('PRAGMA table_info(diagnose_conversations)')
  .all()
  .map((c) => c.name);
if (!diagnoseConversationsColumns.includes('severity')) {
  db.exec('ALTER TABLE diagnose_conversations ADD COLUMN severity TEXT');
}
if (!diagnoseConversationsColumns.includes('severity_reason')) {
  db.exec('ALTER TABLE diagnose_conversations ADD COLUMN severity_reason TEXT');
}

module.exports = db;
