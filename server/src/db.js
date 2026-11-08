const path = require('path');
const Database = require('better-sqlite3');

const db = new Database(path.join(__dirname, '..', 'library.db'));
db.pragma('journal_mode = WAL');

db.exec(`
CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  isbn        TEXT UNIQUE NOT NULL,
  title       TEXT NOT NULL,
  author      TEXT DEFAULT '',
  publisher   TEXT DEFAULT '',
  pubdate     TEXT DEFAULT '',
  cover_url   TEXT DEFAULT '',
  description TEXT DEFAULT '',
  copies      INTEGER NOT NULL DEFAULT 1,
  available   INTEGER NOT NULL DEFAULT 1,
  location    TEXT DEFAULT '',
  created_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
);

CREATE TABLE IF NOT EXISTS loans (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  book_id     INTEGER NOT NULL REFERENCES books(id),
  borrower    TEXT NOT NULL,
  borrowed_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
  returned_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_loans_book ON loans(book_id);
`);

module.exports = db;
