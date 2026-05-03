import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  recordMatch, recordContact, recordReport,
  createUser, getUserByEmail, getUserById,
  saveUserProfile, getUserProfile,
  saveConnection, unsaveConnection, listSavedConnections
} from './db.js';
import {
  hashPassword, verifyPassword, signToken,
  authMiddleware, requireAuth
} from './auth.js';

const PORT = process.env.PORT || 3001;
const TIMER_SECONDS = 120;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.includes('*') ? '*' : allowedOrigins;

const app = express();
app.use(cors({
  origin: corsOrigin,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json({ limit: '600kb' })); // photos as base64 can be ~400KB
app.use(authMiddleware);

app.get('/health', (_req, res) => res.json({ ok: true }));

// ---- Auth ----

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

app.post('/api/signup', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  if (typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }
  if (getUserByEmail(email)) {
    return res.status(409).json({ error: 'An account with that email already exists' });
  }
  try {
    const hash = await hashPassword(password);
    const userId = createUser(email, hash);
    const token = signToken(userId);
    const user = getUserById(userId);
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    console.error('signup failed', err);
    res.status(500).json({ error: 'Signup failed' });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body ?? {};
  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ error: 'Email and password required' });
  }
  const row = getUserByEmail(email);
  if (!row) return res.status(401).json({ error: 'Invalid email or password' });
  const ok = await verifyPassword(password, row.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid email or password' });
  const token = signToken(row.id);
  res.json({ token, user: { id: row.id, email: row.email } });
});

app.get('/api/me', requireAuth, (req, res) => {
  const user = getUserById(req.userId);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const profile = getUserProfile(req.userId);
  res.json({ user: { id: user.id, email: user.email }, profile });
});

app.put('/api/profile', requireAuth, (req, res) => {
  const p = req.body ?? {};
  const validGenders = ['man', 'woman', 'nonbinary', 'other', null];
  const validLF = (lf) => {
    if (!lf || typeof lf !== 'string') return null;
    const tokens = lf.split(',').map(s => s.trim()).filter(Boolean);
    const allowed = new Set(['men', 'women', 'nonbinary', 'everyone']);
    const filtered = tokens.filter(t => allowed.has(t));
    return filtered.length ? filtered.join(',') : null;
  };
  const ageInt = (v) =>
    typeof v === 'number' && v >= 13 && v <= 120 ? Math.floor(v) : null;
  const gender = validGenders.includes(p.gender) ? p.gender : null;

  const safe = {
    name: typeof p.name === 'string' ? p.name.slice(0, 60).trim() || null : null,
    age: ageInt(p.age),
    bio: typeof p.bio === 'string' ? p.bio.slice(0, 400).trim() || null : null,
    vibes: typeof p.vibes === 'string' ? p.vibes.slice(0, 200).trim() || null : null,
    contact: typeof p.contact === 'string' ? p.contact.slice(0, 200).trim() || null : null,
    photo: typeof p.photo === 'string' && p.photo.startsWith('data:image/') && p.photo.length < 400_000
      ? p.photo : null,
    gender,
    looking_for: validLF(p.looking_for),
    age_min: ageInt(p.age_min),
    age_max: ageInt(p.age_max)
  };
  saveUserProfile(req.userId, safe);
  res.json({ profile: safe });
});

// ---- Saved connections ----
app.get('/api/saved', requireAuth, (req, res) => {
  res.json({ saved: listSavedConnections(req.userId) });
});

app.post('/api/saved', requireAuth, (req, res) => {
  const { userId, note } = req.body ?? {};
  if (typeof userId !== 'number' || userId === req.userId) {
    return res.status(400).json({ error: 'Invalid user id' });
  }
  if (!getUserById(userId)) return res.status(404).json({ error: 'User not found' });
  saveConnection(req.userId, userId, typeof note === 'string' ? note.slice(0, 200) : null);
  res.json({ ok: true });
});

app.delete('/api/saved/:userId', requireAuth, (req, res) => {
  const id = parseInt(req.params.userId, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  unsaveConnection(req.userId, id);
  res.json({ ok: true });
});

// ---- AI conversation coach (Claude Haiku) ----
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const COACH_RATE_MS = 15_000;
const lastCoachByIp = new Map();

app.post('/api/coach', async (req, res) => {
  if (!ANTHROPIC_KEY) {
    return res.json({ tip: null, reason: 'coach-disabled' });
  }
  // Light per-IP throttle to keep costs sane.
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const last = lastCoachByIp.get(ip) || 0;
  if (Date.now() - last < COACH_RATE_MS) {
    return res.json({ tip: null, reason: 'rate-limited' });
  }
  lastCoachByIp.set(ip, Date.now());

  const { transcripts, topic, secondsLeft } = req.body ?? {};
  const lines = Array.isArray(transcripts) ? transcripts.slice(-12) : [];
  const ctx = lines.length
    ? lines.map((l, i) => `[${i + 1}] ${String(l).slice(0, 200)}`).join('\n')
    : '(silence — no recent dialogue)';

  const system = `You are a real-time coach for someone on a 2-minute video date. The user can hear you only as a small text card on screen. Read the recent transcript and produce ONE short tip (max 12 words) — a specific, useful next-move suggestion (a question to ask, a topic to mention, or a vibe to bring). No quotes, no preamble, no greeting, no emoji. Just the tip.`;

  const userMsg = `Topic: ${topic || 'open'}\nTime left: ${secondsLeft ?? '?'}s\n\nRecent transcripts (most recent last):\n${ctx}\n\nGive me the tip now.`;

  try {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 60,
        system,
        messages: [{ role: 'user', content: userMsg }]
      })
    });
    if (!r.ok) {
      console.warn('Anthropic API error', r.status, await r.text());
      return res.json({ tip: null, reason: 'upstream-error' });
    }
    const body = await r.json();
    const tip = (body?.content?.[0]?.text || '').trim().replace(/^"|"$/g, '');
    res.json({ tip: tip || null });
  } catch (err) {
    console.warn('coach failed', err);
    res.json({ tip: null, reason: 'error' });
  }
});

/**
 * Return ICE servers for the client. If Twilio creds are present we mint a
 * short-lived NTS token (TURN included). Otherwise we fall back to public
 * STUN — peers behind strict NATs may fail to connect.
 *
 * Tokens are cached for ~50 minutes (Twilio tokens last 1h by default).
 */
const TWILIO_SID = process.env.TWILIO_ACCOUNT_SID;
const TWILIO_TOKEN = process.env.TWILIO_AUTH_TOKEN;
const FALLBACK_ICE = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

let iceCache = { servers: null, expiresAt: 0 };

async function fetchTwilioIce() {
  const auth = Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/Tokens.json`,
    { method: 'POST', headers: { Authorization: `Basic ${auth}` } }
  );
  if (!res.ok) throw new Error(`Twilio ${res.status}`);
  const body = await res.json();
  return body.ice_servers.map(s => ({
    urls: s.urls || s.url,
    username: s.username,
    credential: s.credential
  }));
}

app.get('/ice-servers', async (_req, res) => {
  try {
    if (!TWILIO_SID || !TWILIO_TOKEN) {
      return res.json({ iceServers: FALLBACK_ICE, source: 'stun-only' });
    }
    if (Date.now() < iceCache.expiresAt && iceCache.servers) {
      return res.json({ iceServers: iceCache.servers, source: 'twilio-cached' });
    }
    const servers = await fetchTwilioIce();
    iceCache = { servers, expiresAt: Date.now() + 50 * 60 * 1000 };
    res.json({ iceServers: servers, source: 'twilio' });
  } catch (err) {
    console.error('ICE fetch failed', err);
    res.json({ iceServers: FALLBACK_ICE, source: 'stun-fallback' });
  }
});

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

/**
 * In-memory session state. Nothing about a live conversation is persisted —
 * only the final match record (when both users swipe right) and reports
 * land in SQLite. The rest is ephemeral by design.
 */
// Each queue entry: { socketId, topic, prefs, userProfile }
const queue = [];
const sessions = new Map();          // sessionId -> session
const userToSession = new Map();     // socketId -> sessionId

// Mutual compatibility check: do their preferences allow each other?
function compatible(a, b) {
  // If a user has no profile/prefs, they're match-anyone
  function oneSideOk(self, other) {
    const lf = self?.looking_for;
    if (!lf || lf === '' || lf === 'everyone') return true;
    const want = lf.split(',').map(s => s.trim()).filter(Boolean);
    if (want.length === 0) return true;
    if (!other?.gender) return true; // can't filter on missing data
    return want.includes(other.gender);
  }
  function ageOk(self, other) {
    if (!other?.age) return true;
    if (self?.age_min != null && other.age < self.age_min) return false;
    if (self?.age_max != null && other.age > self.age_max) return false;
    return true;
  }
  return oneSideOk(a, b) && oneSideOk(b, a) && ageOk(a, b) && ageOk(b, a);
}

function makeSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10);
}

function pairUp() {
  // Walk the queue and pair the first compatible pair (matching topic + mutual prefs).
  // O(n^2) but n is tiny in practice; optimise later if needed.
  for (let i = 0; i < queue.length; i++) {
    const a = queue[i];
    const aSock = io.sockets.sockets.get(a.socketId);
    if (!aSock) { queue.splice(i, 1); i--; continue; }
    for (let j = i + 1; j < queue.length; j++) {
      const b = queue[j];
      const bSock = io.sockets.sockets.get(b.socketId);
      if (!bSock) { queue.splice(j, 1); j--; continue; }
      // Topic must match (empty string or 'any' counts as wildcard)
      const topicOk =
        !a.topic || !b.topic ||
        a.topic === 'any' || b.topic === 'any' ||
        a.topic === b.topic;
      if (!topicOk) continue;
      if (!compatible(a.prefs, b.prefs)) continue;

      // Pair them
      queue.splice(j, 1);
      queue.splice(i, 1);

      const sessionId = makeSessionId();
      const session = {
        id: sessionId,
        users: [a.socketId, b.socketId],
        userIds: [a.userId ?? null, b.userId ?? null],
        initiator: a.socketId,
        topic: a.topic === 'any' ? b.topic : a.topic,
        swipes: { [a.socketId]: null, [b.socketId]: null },
        chemistry: 50,
        startedAt: Date.now(),
        timerUnlocksAt: Date.now() + TIMER_SECONDS * 1000,
        matched: false,
        matchDbId: null
      };
      sessions.set(sessionId, session);
      userToSession.set(a.socketId, sessionId);
      userToSession.set(b.socketId, sessionId);

      aSock.join(sessionId);
      bSock.join(sessionId);

      aSock.emit('paired', {
        sessionId, timerSeconds: TIMER_SECONDS, topic: session.topic,
        peerId: b.socketId, role: 'initiator', peerUserId: b.userId ?? null
      });
      bSock.emit('paired', {
        sessionId, timerSeconds: TIMER_SECONDS, topic: session.topic,
        peerId: a.socketId, role: 'receiver', peerUserId: a.userId ?? null
      });

      // Recurse — there might be other pairs ready.
      return pairUp();
    }
  }
}

function partnerOf(session, socketId) {
  return session.users.find(id => id !== socketId);
}

function endSession(sessionId, reason) {
  const session = sessions.get(sessionId);
  if (!session) return;
  for (const uid of session.users) {
    userToSession.delete(uid);
    const sock = io.sockets.sockets.get(uid);
    if (sock) {
      sock.leave(sessionId);
      sock.emit('session-ended', { reason });
    }
  }
  sessions.delete(sessionId);
}

io.on('connection', (socket) => {
  // Optional auth via socket query: client sends ?token=... so we know the user.
  // We use it only to record saved-connection identities; matching is anonymous.
  socket.userId = null;
  try {
    const tokenFromQuery = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (tokenFromQuery) {
      // Lazily import verifyToken to avoid circular issues
      import('./auth.js').then(({ verifyToken }) => {
        const uid = verifyToken(tokenFromQuery);
        if (uid) socket.userId = uid;
      });
    }
  } catch { /* noop */ }

  socket.on('join-queue', (opts = {}) => {
    if (userToSession.has(socket.id)) return; // already paired
    // Remove any existing entry for this socket
    const existing = queue.findIndex(q => q.socketId === socket.id);
    if (existing !== -1) queue.splice(existing, 1);

    const topic = typeof opts.topic === 'string' ? opts.topic.slice(0, 30) : 'any';
    const prefs = (opts.prefs && typeof opts.prefs === 'object') ? {
      gender: typeof opts.prefs.gender === 'string' ? opts.prefs.gender : null,
      age: typeof opts.prefs.age === 'number' ? opts.prefs.age : null,
      looking_for: typeof opts.prefs.looking_for === 'string' ? opts.prefs.looking_for : null,
      age_min: typeof opts.prefs.age_min === 'number' ? opts.prefs.age_min : null,
      age_max: typeof opts.prefs.age_max === 'number' ? opts.prefs.age_max : null
    } : null;

    queue.push({ socketId: socket.id, topic, prefs, userId: socket.userId });
    socket.emit('queued', { position: queue.length });
    pairUp();
  });

  socket.on('leave-queue', () => {
    const idx = queue.findIndex(q => q.socketId === socket.id);
    if (idx !== -1) queue.splice(idx, 1);
  });

  // ----- WebRTC signaling relay -----
  socket.on('signal', ({ sessionId, data }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    const peer = partnerOf(session, socket.id);
    io.to(peer).emit('signal', { from: socket.id, data });
  });

  // ----- Chemistry score updates (computed client-side, broadcast to peer) -----
  socket.on('chemistry-update', ({ sessionId, score }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    session.chemistry = Math.max(0, Math.min(100, Math.round(score)));
    io.to(session.id).emit('chemistry', { score: session.chemistry });
  });

  // ----- Swipe -----
  socket.on('swipe', ({ sessionId, direction }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    if (Date.now() < session.timerUnlocksAt) return; // can't swipe yet

    session.swipes[socket.id] = direction; // 'left' or 'right'

    if (direction === 'left') {
      // Either left swipe immediately ends the session.
      const peer = partnerOf(session, socket.id);
      io.to(peer).emit('peer-swiped-left');
      endSession(session.id, 'rejected');
      return;
    }

    // Right swipe: notify peer we liked them.
    const peer = partnerOf(session, socket.id);
    io.to(peer).emit('peer-swiped-right');

    const both = session.users.every(uid => session.swipes[uid] === 'right');
    if (both && !session.matched) {
      session.matched = true;
      session.matchDbId = recordMatch(session.users[0], session.users[1], session.chemistry);
      // Send each side the OTHER user's userId (for save-connection feature)
      const [aSocket, bSocket] = session.users;
      const [aUid, bUid] = session.userIds || [null, null];
      io.to(aSocket).emit('matched', { matchId: session.matchDbId, chemistry: session.chemistry, peerUserId: bUid });
      io.to(bSocket).emit('matched', { matchId: session.matchDbId, chemistry: session.chemistry, peerUserId: aUid });
    }
  });

  // ----- Next button: skip current partner, requeue -----
  socket.on('next', ({ sessionId }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    const peer = partnerOf(session, socket.id);
    io.to(peer).emit('peer-left');
    endSession(session.id, 'next');
  });

  // ----- Contact exchange after a match -----
  socket.on('share-contact', ({ sessionId, contact }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.matched) return;
    if (!session.users.includes(socket.id)) return;
    const peer = partnerOf(session, socket.id);
    io.to(peer).emit('peer-contact', { contact });

    const isA = session.users[0] === socket.id;
    recordContact(
      session.matchDbId,
      session.users[0], isA ? contact : null,
      session.users[1], isA ? null : contact
    );
  });

  socket.on('report', ({ sessionId, reason }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    const peer = partnerOf(session, socket.id);
    recordReport(socket.id, peer, reason);
    endSession(session.id, 'reported');
  });

  socket.on('disconnect', () => {
    const idx = queue.findIndex(q => q.socketId === socket.id);
    if (idx !== -1) queue.splice(idx, 1);

    const sessionId = userToSession.get(socket.id);
    if (sessionId) {
      const session = sessions.get(sessionId);
      if (session) {
        const peer = partnerOf(session, socket.id);
        if (peer) io.to(peer).emit('peer-left');
      }
      endSession(sessionId, 'peer-disconnected');
    }
  });
});

server.listen(PORT, () => {
  console.log(`Glimpse signaling server listening on http://localhost:${PORT}`);
});
