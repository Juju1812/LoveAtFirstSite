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

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS user_profiles (
    user_id INTEGER PRIMARY KEY,
    name TEXT,
    age INTEGER,
    bio TEXT,
    vibes TEXT,
    contact TEXT,
    photo TEXT,
    gender TEXT,
    looking_for TEXT,       -- comma-separated: "men,women,nonbinary,everyone"
    age_min INTEGER,
    age_max INTEGER,
    verified INTEGER DEFAULT 0,
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS saved_connections (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    saver_user_id INTEGER NOT NULL,
    saved_user_id INTEGER NOT NULL,
    saved_at INTEGER NOT NULL,
    note TEXT,
    UNIQUE(saver_user_id, saved_user_id),
    FOREIGN KEY (saver_user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (saved_user_id) REFERENCES users(id) ON DELETE CASCADE
  );
`);

// Migration: add new columns to user_profiles for users who already have rows.
// SQLite's IF NOT EXISTS doesn't apply to ALTER TABLE; do it defensively.
const existingCols = db.prepare("PRAGMA table_info(user_profiles)").all().map(c => c.name);
const newCols = [
  ['gender', 'TEXT'],
  ['looking_for', 'TEXT'],
  ['age_min', 'INTEGER'],
  ['age_max', 'INTEGER'],
  ['verified', 'INTEGER DEFAULT 0']
];
for (const [name, type] of newCols) {
  if (!existingCols.includes(name)) {
    try { db.exec(`ALTER TABLE user_profiles ADD COLUMN ${name} ${type}`); }
    catch (e) { /* ignore — column may already exist */ }
  }
}

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

// ---- Users ----
const insertUser = db.prepare(
  'INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)'
);
const findUserByEmail = db.prepare(
  'SELECT id, email, password_hash FROM users WHERE email = ? COLLATE NOCASE'
);
const findUserById = db.prepare(
  'SELECT id, email, created_at FROM users WHERE id = ?'
);

export function createUser(email, passwordHash) {
  const result = insertUser.run(email.toLowerCase().trim(), passwordHash, Date.now());
  return Number(result.lastInsertRowid);
}

export function getUserByEmail(email) {
  return findUserByEmail.get(email.toLowerCase().trim()) || null;
}

export function getUserById(id) {
  return findUserById.get(id) || null;
}

// ---- User profiles ----
const upsertProfile = db.prepare(`
  INSERT INTO user_profiles
    (user_id, name, age, bio, vibes, contact, photo, gender, looking_for, age_min, age_max, updated_at)
  VALUES
    (@user_id, @name, @age, @bio, @vibes, @contact, @photo, @gender, @looking_for, @age_min, @age_max, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    name = excluded.name,
    age = excluded.age,
    bio = excluded.bio,
    vibes = excluded.vibes,
    contact = excluded.contact,
    photo = excluded.photo,
    gender = excluded.gender,
    looking_for = excluded.looking_for,
    age_min = excluded.age_min,
    age_max = excluded.age_max,
    updated_at = excluded.updated_at
`);
const selectProfile = db.prepare(`
  SELECT name, age, bio, vibes, contact, photo, gender, looking_for, age_min, age_max, verified, updated_at
  FROM user_profiles WHERE user_id = ?
`);

export function saveUserProfile(userId, p) {
  upsertProfile.run({
    user_id: userId,
    name: p.name ?? null,
    age: p.age ?? null,
    bio: p.bio ?? null,
    vibes: p.vibes ?? null,
    contact: p.contact ?? null,
    photo: p.photo ?? null,
    gender: p.gender ?? null,
    looking_for: p.looking_for ?? null,
    age_min: p.age_min ?? null,
    age_max: p.age_max ?? null,
    updated_at: Date.now()
  });
}

export function getUserProfile(userId) {
  return selectProfile.get(userId) || null;
}

// ---- Saved connections ----
const insertSaved = db.prepare(`
  INSERT INTO saved_connections (saver_user_id, saved_user_id, saved_at, note)
  VALUES (?, ?, ?, ?)
  ON CONFLICT(saver_user_id, saved_user_id) DO UPDATE SET saved_at = excluded.saved_at, note = excluded.note
`);
const deleteSaved = db.prepare('DELETE FROM saved_connections WHERE saver_user_id = ? AND saved_user_id = ?');
const listSavedByUser = db.prepare(`
  SELECT sc.saved_user_id AS user_id, sc.saved_at, sc.note,
         up.name, up.photo, up.bio, up.vibes
  FROM saved_connections sc
  LEFT JOIN user_profiles up ON up.user_id = sc.saved_user_id
  WHERE sc.saver_user_id = ?
  ORDER BY sc.saved_at DESC
`);
const isMutuallySaved = db.prepare(
  'SELECT 1 FROM saved_connections WHERE saver_user_id = ? AND saved_user_id = ?'
);

export function saveConnection(saverId, savedId, note) {
  insertSaved.run(saverId, savedId, Date.now(), note ?? null);
}

export function unsaveConnection(saverId, savedId) {
  deleteSaved.run(saverId, savedId);
}

export function listSavedConnections(userId) {
  const rows = listSavedByUser.all(userId);
  // Annotate with mutual flag
  return rows.map(r => ({
    ...r,
    mutual: !!isMutuallySaved.get(r.user_id, userId)
  }));
}
