import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, 'data');
mkdirSync(dataDir, { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'loveatfirstsite.db'));

db.exec(`
  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a TEXT NOT NULL,
    user_b TEXT NOT NULL,
    contact_a TEXT,
    contact_b TEXT,
    chemistry INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter TEXT NOT NULL,
    reported TEXT NOT NULL,
    reason TEXT,
    created_at INTEGER NOT NULL
  );
`);

const insertMatch = db.prepare(
  'INSERT INTO matches (user_a, user_b, chemistry, created_at) VALUES (?, ?, ?, ?)'
);
const insertReport = db.prepare(
  'INSERT INTO reports (reporter, reported, reason, created_at) VALUES (?, ?, ?, ?)'
);
const updateContact = db.prepare(
  'UPDATE matches SET contact_a = COALESCE(contact_a, ?), contact_b = COALESCE(contact_b, ?) WHERE id = ?'
);

export function recordMatch(userA, userB, chemistry) {
  const result = insertMatch.run(userA, userB, chemistry ?? 0, Date.now());
  return Number(result.lastInsertRowid);
}

export function recordContact(matchId, userA, contactA, userB, contactB) {
  updateContact.run(contactA ?? null, contactB ?? null, matchId);
}

export function recordReport(reporter, reported, reason) {
  insertReport.run(reporter, reported, reason ?? null, Date.now());
}
