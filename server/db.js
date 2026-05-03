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
    updated_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
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
  INSERT INTO user_profiles (user_id, name, age, bio, vibes, contact, photo, updated_at)
  VALUES (@user_id, @name, @age, @bio, @vibes, @contact, @photo, @updated_at)
  ON CONFLICT(user_id) DO UPDATE SET
    name = excluded.name,
    age = excluded.age,
    bio = excluded.bio,
    vibes = excluded.vibes,
    contact = excluded.contact,
    photo = excluded.photo,
    updated_at = excluded.updated_at
`);
const selectProfile = db.prepare(
  'SELECT name, age, bio, vibes, contact, photo, updated_at FROM user_profiles WHERE user_id = ?'
);

export function saveUserProfile(userId, p) {
  upsertProfile.run({
    user_id: userId,
    name: p.name ?? null,
    age: p.age ?? null,
    bio: p.bio ?? null,
    vibes: p.vibes ?? null,
    contact: p.contact ?? null,
    photo: p.photo ?? null,
    updated_at: Date.now()
  });
}

export function getUserProfile(userId) {
  return selectProfile.get(userId) || null;
}
