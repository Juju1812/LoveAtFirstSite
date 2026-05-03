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

  CREATE TABLE IF NOT EXISTS conversations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_a_id INTEGER NOT NULL,
    user_b_id INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    last_msg_at INTEGER NOT NULL,
    UNIQUE(user_a_id, user_b_id),
    FOREIGN KEY (user_a_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (user_b_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conversation_id INTEGER NOT NULL,
    sender_id INTEGER NOT NULL,
    body TEXT NOT NULL,
    sent_at INTEGER NOT NULL,
    FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_messages_convo ON messages(conversation_id, sent_at);

  CREATE TABLE IF NOT EXISTS conversation_reads (
    conversation_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    last_read_at INTEGER NOT NULL,
    PRIMARY KEY (conversation_id, user_id)
  );

  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    starts_at INTEGER NOT NULL,
    ends_at INTEGER NOT NULL,
    topic TEXT,
    age_min INTEGER,
    age_max INTEGER,
    max_participants INTEGER,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS event_rsvps (
    event_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    rsvp_at INTEGER NOT NULL,
    PRIMARY KEY (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS call_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    peer_user_id INTEGER,
    topic TEXT,
    peak_chemistry INTEGER,
    avg_chemistry INTEGER,
    final_chemistry INTEGER,
    you_swiped TEXT,           -- 'right' | 'left' | null
    peer_swiped TEXT,
    matched INTEGER DEFAULT 0,
    duration_sec INTEGER,
    ended_at INTEGER NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_call_history_user ON call_history(user_id, ended_at);

  CREATE TABLE IF NOT EXISTS reported_content (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reporter_user_id INTEGER,
    reported_user_id INTEGER,
    reporter_socket TEXT,
    reported_socket TEXT,
    kind TEXT NOT NULL,  -- 'user', 'message-flagged'
    detail TEXT,
    reviewed INTEGER DEFAULT 0,
    created_at INTEGER NOT NULL
  );
`);

// Seed a couple of demo events if the table is empty so the UI has data
const eventCount = db.prepare('SELECT COUNT(*) AS n FROM events').get().n;
if (eventCount === 0) {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const seed = db.prepare(`
    INSERT INTO events (name, description, starts_at, ends_at, topic, age_min, age_max, max_participants, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  seed.run("Tuesday Wine Night", "Casual evening match-up with a glass-of-wine vibe.", now + 1 * day, now + 1 * day + 90 * 60 * 1000, 'drinks', 21, 35, 50, now);
  seed.run("Deep Talk Saturday", "Skip the small talk. Just real conversations.", now + 4 * day, now + 4 * day + 90 * 60 * 1000, 'deep', 23, 40, 30, now);
  seed.run("Same-City Sunday", "Looking for people in your area for an actual date.", now + 5 * day, now + 5 * day + 90 * 60 * 1000, 'plans', 21, 45, 60, now);
}

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

// ---- Conversations & messages ----
const findConvo = db.prepare(
  'SELECT id, user_a_id, user_b_id, created_at, last_msg_at FROM conversations WHERE (user_a_id = ? AND user_b_id = ?) OR (user_a_id = ? AND user_b_id = ?)'
);
const insertConvo = db.prepare(
  'INSERT INTO conversations (user_a_id, user_b_id, created_at, last_msg_at) VALUES (?, ?, ?, ?)'
);
const insertMessage = db.prepare(
  'INSERT INTO messages (conversation_id, sender_id, body, sent_at) VALUES (?, ?, ?, ?)'
);
const touchConvo = db.prepare(
  'UPDATE conversations SET last_msg_at = ? WHERE id = ?'
);
const upsertRead = db.prepare(`
  INSERT INTO conversation_reads (conversation_id, user_id, last_read_at)
  VALUES (?, ?, ?)
  ON CONFLICT(conversation_id, user_id) DO UPDATE SET last_read_at = excluded.last_read_at
`);
const listConvosForUser = db.prepare(`
  SELECT c.id, c.user_a_id, c.user_b_id, c.last_msg_at,
    CASE WHEN c.user_a_id = ? THEN c.user_b_id ELSE c.user_a_id END AS peer_id,
    (SELECT body FROM messages WHERE conversation_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_body,
    (SELECT sender_id FROM messages WHERE conversation_id = c.id ORDER BY sent_at DESC LIMIT 1) AS last_sender,
    COALESCE((SELECT last_read_at FROM conversation_reads WHERE conversation_id = c.id AND user_id = ?), 0) AS last_read_at
  FROM conversations c
  WHERE c.user_a_id = ? OR c.user_b_id = ?
  ORDER BY c.last_msg_at DESC
`);
const listMessagesIn = db.prepare(
  'SELECT id, sender_id, body, sent_at FROM messages WHERE conversation_id = ? ORDER BY sent_at ASC'
);
const isParticipant = db.prepare(
  'SELECT 1 FROM conversations WHERE id = ? AND (user_a_id = ? OR user_b_id = ?)'
);
const peerProfileForConvo = db.prepare(`
  SELECT up.user_id, up.name, up.photo, up.bio, up.vibes
  FROM user_profiles up WHERE up.user_id = ?
`);

export function ensureConversation(userIdA, userIdB) {
  const lo = Math.min(userIdA, userIdB);
  const hi = Math.max(userIdA, userIdB);
  let row = findConvo.get(lo, hi, hi, lo);
  if (row) return row.id;
  const now = Date.now();
  const result = insertConvo.run(lo, hi, now, now);
  return Number(result.lastInsertRowid);
}

export function sendMessage(convoId, senderId, body) {
  const now = Date.now();
  const result = insertMessage.run(convoId, senderId, body, now);
  touchConvo.run(now, convoId);
  return { id: Number(result.lastInsertRowid), conversation_id: convoId, sender_id: senderId, body, sent_at: now };
}

export function listConversations(userId) {
  const rows = listConvosForUser.all(userId, userId, userId, userId);
  return rows.map(r => {
    const peer = peerProfileForConvo.get(r.peer_id);
    return {
      id: r.id,
      peer_id: r.peer_id,
      peer_name: peer?.name ?? null,
      peer_photo: peer?.photo ?? null,
      peer_bio: peer?.bio ?? null,
      last_body: r.last_body ?? null,
      last_sender: r.last_sender ?? null,
      last_msg_at: r.last_msg_at,
      unread: r.last_msg_at > r.last_read_at && r.last_sender !== userId ? 1 : 0
    };
  });
}

export function listMessages(convoId, userId) {
  if (!isParticipant.get(convoId, userId, userId)) return null;
  return listMessagesIn.all(convoId);
}

export function checkParticipant(convoId, userId) {
  return !!isParticipant.get(convoId, userId, userId);
}

export function markConversationRead(convoId, userId) {
  upsertRead.run(convoId, userId, Date.now());
}

// ---- Events ----
const listUpcomingEvents = db.prepare(`
  SELECT id, name, description, starts_at, ends_at, topic, age_min, age_max, max_participants
  FROM events WHERE ends_at > ?
  ORDER BY starts_at ASC LIMIT 20
`);
const insertRsvp = db.prepare(
  'INSERT OR IGNORE INTO event_rsvps (event_id, user_id, rsvp_at) VALUES (?, ?, ?)'
);
const removeRsvp = db.prepare('DELETE FROM event_rsvps WHERE event_id = ? AND user_id = ?');
const listMyRsvps = db.prepare(
  'SELECT event_id FROM event_rsvps WHERE user_id = ?'
);
const countRsvps = db.prepare('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id = ?');
const isRsvpdNow = db.prepare(`
  SELECT e.id FROM events e
  JOIN event_rsvps r ON r.event_id = e.id
  WHERE r.user_id = ? AND e.starts_at <= ? AND e.ends_at > ?
`);

export function getUpcomingEvents(userId) {
  const rows = listUpcomingEvents.all(Date.now());
  const myRsvps = userId ? new Set(listMyRsvps.all(userId).map(r => r.event_id)) : new Set();
  return rows.map(r => ({
    ...r,
    rsvpd: myRsvps.has(r.id),
    rsvp_count: countRsvps.get(r.id).n
  }));
}

export function rsvpEvent(eventId, userId) {
  insertRsvp.run(eventId, userId, Date.now());
}

export function unrsvpEvent(eventId, userId) {
  removeRsvp.run(eventId, userId);
}

export function getActiveEventForUser(userId) {
  const now = Date.now();
  const row = isRsvpdNow.get(userId, now, now);
  return row ? row.id : null;
}

// ---- Call history (for compatibility insights) ----
const insertHistory = db.prepare(`
  INSERT INTO call_history
    (user_id, peer_user_id, topic, peak_chemistry, avg_chemistry, final_chemistry,
     you_swiped, peer_swiped, matched, duration_sec, ended_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
`);
const myHistory = db.prepare(
  'SELECT * FROM call_history WHERE user_id = ? ORDER BY ended_at DESC LIMIT 100'
);

export function recordCallHistory(row) {
  insertHistory.run(
    row.user_id, row.peer_user_id ?? null, row.topic ?? null,
    Math.round(row.peak_chemistry ?? 50),
    Math.round(row.avg_chemistry ?? 50),
    Math.round(row.final_chemistry ?? 50),
    row.you_swiped ?? null, row.peer_swiped ?? null,
    row.matched ? 1 : 0,
    Math.round(row.duration_sec ?? 0),
    row.ended_at ?? Date.now()
  );
}

export function getMyHistory(userId) {
  return myHistory.all(userId);
}

// ---- Reports admin ----
const insertReportedContent = db.prepare(`
  INSERT INTO reported_content
    (reporter_user_id, reported_user_id, reporter_socket, reported_socket, kind, detail, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const listOpenReports = db.prepare(
  'SELECT * FROM reported_content WHERE reviewed = 0 ORDER BY created_at DESC LIMIT 100'
);

export function recordContentReport(row) {
  insertReportedContent.run(
    row.reporter_user_id ?? null,
    row.reported_user_id ?? null,
    row.reporter_socket ?? null,
    row.reported_socket ?? null,
    row.kind, row.detail ?? null, Date.now()
  );
}

export function getOpenReports() {
  return listOpenReports.all();
}
