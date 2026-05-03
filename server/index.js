import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import {
  db,
  recordMatch, recordContact, recordReport,
  createUser, getUserByEmail, getUserById,
  saveUserProfile, getUserProfile,
  saveConnection, unsaveConnection, listSavedConnections,
  ensureConversation, sendMessage, listConversations, listMessages,
  checkParticipant, markConversationRead,
  getUpcomingEvents, rsvpEvent, unrsvpEvent, getActiveEventForUser,
  recordCallHistory, getMyHistory,
  recordContentReport, getOpenReports,
  recordLike, dismissLike, undoMyLike, getLikesReceived, getLikesGiven,
  setUserStripeCustomer, updateSubscriptionStatus, getUserByStripeCustomer,
  getFullUser, isUserPremium
} from './db.js';
import Stripe from 'stripe';
import {
  hashPassword, verifyPassword, signToken,
  authMiddleware, requireAuth
} from './auth.js';

const PORT = process.env.PORT || 3001;
const TIMER_SECONDS = 120;
const LIKE_UNLOCK_SECONDS = 30;

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

// ---- Stripe init (optional — premium features disabled if not configured) ----
const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || 'https://glimpse.dating';
const stripe = STRIPE_KEY ? new Stripe(STRIPE_KEY) : null;
if (!stripe) {
  console.warn('[stripe] STRIPE_SECRET_KEY not set — Glimpse+ disabled.');
}

// Webhook MUST receive raw body for signature verification — register BEFORE express.json()
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return res.status(503).json({ error: 'billing not configured' });
  }
  let event;
  try {
    const sig = req.headers['stripe-signature'];
    event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.warn('Stripe webhook signature failed', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const customerId = session.customer;
        const userId = session.client_reference_id ? Number(session.client_reference_id) : null;
        if (userId && customerId) {
          setUserStripeCustomer(userId, customerId);
        }
        // Subscription status will arrive via subscription.created/updated
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const customerId = sub.customer;
        updateSubscriptionStatus(
          customerId,
          sub.status,
          sub.current_period_end ?? null
        );
        break;
      }
      // invoice.paid / invoice.payment_failed are useful for analytics; ignore for now
    }
    res.json({ received: true });
  } catch (err) {
    console.error('webhook handler failed', err);
    res.status(500).json({ error: 'webhook handler failed' });
  }
});

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
  const premium = isUserPremium(req.userId);
  res.json({
    user: { id: user.id, email: user.email, premium },
    profile
  });
});

// ---- Billing: Checkout + Portal ----
app.post('/api/billing/checkout', requireAuth, async (req, res) => {
  if (!stripe || !STRIPE_PRICE_ID) {
    return res.status(503).json({ error: 'Glimpse+ is not configured yet.' });
  }
  try {
    const u = getFullUser(req.userId);
    if (!u) return res.status(404).json({ error: 'User not found' });

    let customerId = u.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: u.email,
        metadata: { glimpse_user_id: String(u.id) }
      });
      customerId = customer.id;
      setUserStripeCustomer(u.id, customerId);
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      client_reference_id: String(u.id),
      success_url: `${PUBLIC_BASE_URL}/upgrade?status=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_BASE_URL}/upgrade?status=cancelled`,
      allow_promotion_codes: true
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error('checkout failed', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/billing/portal', requireAuth, async (req, res) => {
  if (!stripe) return res.status(503).json({ error: 'billing not configured' });
  try {
    const u = getFullUser(req.userId);
    if (!u || !u.stripe_customer_id) {
      return res.status(400).json({ error: 'No active subscription to manage' });
    }
    const session = await stripe.billingPortal.sessions.create({
      customer: u.stripe_customer_id,
      return_url: `${PUBLIC_BASE_URL}/settings`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('portal failed', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- Replay (premium feature) ----
// Lets a premium user undo their last 'you-rejected' from call_history within 24h.
// On undo, the rejected user becomes likeable again — we record a like so they
// show up in your "You liked" feed and trigger a mutual if they liked you.
app.post('/api/billing/replay', requireAuth, (req, res) => {
  if (!isUserPremium(req.userId)) {
    return res.status(403).json({ error: 'Glimpse+ required' });
  }
  // Find most recent rejection in last 24h
  const oneDayAgo = Date.now() - 24 * 60 * 60 * 1000;
  const recent = db.prepare(`
    SELECT id, peer_user_id, topic, avg_chemistry, ended_at
    FROM call_history
    WHERE user_id = ? AND you_swiped = 'left' AND ended_at > ?
    ORDER BY ended_at DESC LIMIT 1
  `).get(req.userId, oneDayAgo);
  if (!recent || !recent.peer_user_id) {
    return res.status(404).json({ error: "Nothing to replay — you haven't passed in the last 24h." });
  }
  // Flip the swipe in history (cosmetic — doesn't affect anything)
  db.prepare(`UPDATE call_history SET you_swiped = 'right' WHERE id = ?`).run(recent.id);
  // Record a like (will be picked up if they also liked us)
  recordLike(req.userId, recent.peer_user_id, {
    topic: recent.topic, chemistry: recent.avg_chemistry
  });
  // If reverse like exists, ensure conversation
  let conversationId = null;
  const reverse = db.prepare(
    'SELECT 1 FROM likes WHERE liker_user_id = ? AND liked_user_id = ? AND dismissed = 0'
  ).get(recent.peer_user_id, req.userId);
  if (reverse) {
    try { conversationId = ensureConversation(req.userId, recent.peer_user_id); } catch {}
  }
  res.json({ ok: true, peerUserId: recent.peer_user_id, mutual: !!reverse, conversationId });
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

// ---- Messaging ----
app.get('/api/conversations', requireAuth, (req, res) => {
  res.json({ conversations: listConversations(req.userId) });
});

app.get('/api/conversations/:id/messages', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  const msgs = listMessages(id, req.userId);
  if (msgs == null) return res.status(403).json({ error: 'Not your conversation' });
  res.json({ messages: msgs });
});

app.post('/api/conversations/:id/messages', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { body } = req.body ?? {};
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  if (typeof body !== 'string' || !body.trim()) return res.status(400).json({ error: 'Empty message' });
  if (!checkParticipant(id, req.userId)) return res.status(403).json({ error: 'Not your conversation' });
  const text = body.trim().slice(0, 1000);

  // Optional moderation pass before persisting
  const flag = await moderateText(text);
  if (flag.flagged) {
    recordContentReport({
      reporter_user_id: null, reported_user_id: req.userId,
      kind: 'message-flagged', detail: `Auto: ${flag.categories?.join(',') ?? ''} | ${text.slice(0,200)}`
    });
    return res.status(400).json({ error: 'Message blocked by moderation' });
  }

  const msg = sendMessage(id, req.userId, text);
  // Notify peer if connected
  const userSocketIds = userSockets.get(getOtherParticipant(id, req.userId));
  if (userSocketIds) {
    for (const sid of userSocketIds) {
      io.to(sid).emit('message', { conversationId: id, message: msg });
    }
  }
  res.json({ message: msg });
});

app.post('/api/conversations/:id/read', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id) || !checkParticipant(id, req.userId)) {
    return res.status(403).json({ error: 'Not your conversation' });
  }
  markConversationRead(id, req.userId);
  res.json({ ok: true });
});

// ---- Events ----
app.get('/api/events', (req, res) => {
  res.json({ events: getUpcomingEvents(req.userId) });
});

app.post('/api/events/:id/rsvp', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  rsvpEvent(id, req.userId);
  res.json({ ok: true });
});

app.delete('/api/events/:id/rsvp', requireAuth, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Bad id' });
  unrsvpEvent(id, req.userId);
  res.json({ ok: true });
});

// ---- Likes ----
app.get('/api/likes', requireAuth, (req, res) => {
  const received = getLikesReceived(req.userId);
  const given = getLikesGiven(req.userId);
  // Mutual = received entries where i_liked_them = 1 (or given where they_liked_me = 1)
  const mutualUserIds = new Set(received.filter(r => r.i_liked_them).map(r => r.user_id));
  res.json({
    received_only: received.filter(r => !r.i_liked_them),
    mutual: received.filter(r => r.i_liked_them),
    given_only: given.filter(g => !g.they_liked_me && !mutualUserIds.has(g.user_id))
  });
});

app.post('/api/likes/:userId/like-back', requireAuth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(otherId) || otherId === req.userId) {
    return res.status(400).json({ error: 'Invalid user' });
  }
  if (!getUserById(otherId)) return res.status(404).json({ error: 'User not found' });
  // Confirm they liked me first; otherwise nothing to "like back"
  const theirLike = getLikesReceived(req.userId).find(r => r.user_id === otherId);
  if (!theirLike) return res.status(404).json({ error: 'They did not like you' });
  // Record my like and create a conversation
  const wasReverse = recordLike(req.userId, otherId, {
    topic: theirLike.topic,
    chemistry: theirLike.chemistry
  });
  let conversationId = null;
  try { conversationId = ensureConversation(req.userId, otherId); } catch { /* noop */ }
  res.json({ ok: true, conversationId, mutual: wasReverse || true });
});

app.post('/api/likes/:userId/dismiss', requireAuth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Bad id' });
  // The other person liked me (their like on me). Mark as dismissed.
  dismissLike(otherId, req.userId);
  res.json({ ok: true });
});

app.delete('/api/likes/:userId', requireAuth, (req, res) => {
  const otherId = parseInt(req.params.userId, 10);
  if (!Number.isFinite(otherId)) return res.status(400).json({ error: 'Bad id' });
  // Undo my own like
  undoMyLike(req.userId, otherId);
  res.json({ ok: true });
});

// ---- Insights / compatibility data ----
app.get('/api/insights', requireAuth, (req, res) => {
  const history = getMyHistory(req.userId);
  if (history.length === 0) {
    return res.json({ history: [], summary: null });
  }
  const total = history.length;
  const avg = (key) => Math.round(history.reduce((s, h) => s + (h[key] ?? 50), 0) / total);
  const matchRate = history.filter(h => h.matched).length / total;
  const topicCounts = {};
  const topicChem = {};
  for (const h of history) {
    const t = h.topic || 'any';
    topicCounts[t] = (topicCounts[t] || 0) + 1;
    topicChem[t] = (topicChem[t] || 0) + (h.avg_chemistry ?? 50);
  }
  let bestTopic = null, bestScore = -1;
  for (const t of Object.keys(topicCounts)) {
    if (topicCounts[t] >= 2) {
      const s = topicChem[t] / topicCounts[t];
      if (s > bestScore) { bestScore = s; bestTopic = t; }
    }
  }
  res.json({
    history,
    summary: {
      total_calls: total,
      avg_chemistry: avg('avg_chemistry'),
      avg_peak: avg('peak_chemistry'),
      match_rate_pct: Math.round(matchRate * 100),
      best_topic: bestTopic,
      best_topic_avg: bestScore > 0 ? Math.round(bestScore) : null
    }
  });
});

// ---- Admin ----
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
function requireAdmin(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'auth required' });
  const u = getUserById(req.userId);
  if (!u || !ADMIN_EMAILS.includes(u.email.toLowerCase())) {
    return res.status(403).json({ error: 'admin only' });
  }
  next();
}
app.get('/api/admin/reports', requireAdmin, (_req, res) => {
  res.json({ reports: getOpenReports() });
});

// ---- Text moderation ----
const OPENAI_KEY = process.env.OPENAI_API_KEY;
async function moderateText(text) {
  if (!OPENAI_KEY) return { flagged: false };
  try {
    const r = await fetch('https://api.openai.com/v1/moderations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({ model: 'omni-moderation-latest', input: text })
    });
    if (!r.ok) return { flagged: false };
    const body = await r.json();
    const result = body.results?.[0];
    if (!result) return { flagged: false };
    if (!result.flagged) return { flagged: false };
    const categories = Object.entries(result.categories || {}).filter(([_, v]) => v).map(([k]) => k);
    return { flagged: true, categories };
  } catch { return { flagged: false }; }
}

app.post('/api/moderate-text', async (req, res) => {
  const { text } = req.body ?? {};
  if (typeof text !== 'string') return res.status(400).json({ error: 'Bad input' });
  const out = await moderateText(text);
  res.json(out);
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
  // Premium users skip the rate limit
  const premium = req.userId ? isUserPremium(req.userId) : false;
  if (!premium && Date.now() - last < COACH_RATE_MS) {
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
const userSockets = new Map();       // userId -> Set<socketId>  (for real-time messaging)

function getOtherParticipant(convoId, userId) {
  // We don't have a fast lookup; rely on the conversation row
  const row = (function () {
    try {
      return db.prepare('SELECT user_a_id, user_b_id FROM conversations WHERE id = ?').get(convoId);
    } catch { return null; }
  })();
  if (!row) return null;
  return row.user_a_id === userId ? row.user_b_id : row.user_a_id;
}

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
      // Event-gated: if either side is in an event, both must be in the same event.
      if ((a.eventId || null) !== (b.eventId || null)) continue;
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
        sessionId, timerSeconds: TIMER_SECONDS, likeUnlockSeconds: LIKE_UNLOCK_SECONDS,
        topic: session.topic,
        peerId: b.socketId, role: 'initiator', peerUserId: b.userId ?? null
      });
      bSock.emit('paired', {
        sessionId, timerSeconds: TIMER_SECONDS, likeUnlockSeconds: LIKE_UNLOCK_SECONDS,
        topic: session.topic,
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

  // Persist per-user call history for logged-in participants
  try {
    const [aUid, bUid] = session.userIds || [null, null];
    const [aSock, bSock] = session.users;
    const durationSec = Math.round((Date.now() - session.startedAt) / 1000);
    if (aUid) {
      recordCallHistory({
        user_id: aUid, peer_user_id: bUid,
        topic: session.topic,
        peak_chemistry: session.peakChemistry ?? session.chemistry,
        avg_chemistry: session.avgChemistry ?? session.chemistry,
        final_chemistry: session.chemistry,
        you_swiped: session.swipes[aSock] ?? null,
        peer_swiped: session.swipes[bSock] ?? null,
        matched: session.matched,
        duration_sec: durationSec,
        ended_at: Date.now()
      });
    }
    if (bUid) {
      recordCallHistory({
        user_id: bUid, peer_user_id: aUid,
        topic: session.topic,
        peak_chemistry: session.peakChemistry ?? session.chemistry,
        avg_chemistry: session.avgChemistry ?? session.chemistry,
        final_chemistry: session.chemistry,
        you_swiped: session.swipes[bSock] ?? null,
        peer_swiped: session.swipes[aSock] ?? null,
        matched: session.matched,
        duration_sec: durationSec,
        ended_at: Date.now()
      });
    }
  } catch (err) { console.warn('history record failed', err); }

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
  socket.userId = null;
  try {
    const tokenFromQuery = socket.handshake?.auth?.token || socket.handshake?.query?.token;
    if (tokenFromQuery) {
      import('./auth.js').then(({ verifyToken }) => {
        const uid = verifyToken(tokenFromQuery);
        if (uid) {
          socket.userId = uid;
          if (!userSockets.has(uid)) userSockets.set(uid, new Set());
          userSockets.get(uid).add(socket.id);
          socket.emit('auth-ready');
        }
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

    const eventId = socket.userId ? getActiveEventForUser(socket.userId) : null;
    const isPremium = socket.userId ? isUserPremium(socket.userId) : false;
    const entry = { socketId: socket.id, topic, prefs, userId: socket.userId, eventId, isPremium, joinedAt: Date.now() };
    // Premium users: insert at the front of the queue so they get matched first
    if (isPremium) {
      // Find the position: after other premium users but before non-premium
      let insertAt = 0;
      while (insertAt < queue.length && queue[insertAt].isPremium) insertAt++;
      queue.splice(insertAt, 0, entry);
    } else {
      queue.push(entry);
    }
    socket.emit('queued', { position: queue.findIndex(q => q.socketId === socket.id) + 1, eventId });
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
    session.peakChemistry = Math.max(session.peakChemistry ?? 50, session.chemistry);
    // Running average via incremental update
    session.avgSamples = (session.avgSamples ?? 0) + 1;
    session.avgChemistry = ((session.avgChemistry ?? session.chemistry) * (session.avgSamples - 1) + session.chemistry) / session.avgSamples;
    io.to(session.id).emit('chemistry', { score: session.chemistry });
  });

  // ----- Swipe -----
  socket.on('swipe', ({ sessionId, direction }) => {
    const session = sessions.get(sessionId);
    if (!session || !session.users.includes(socket.id)) return;
    const now = Date.now();
    const likeUnlocksAt = session.startedAt + LIKE_UNLOCK_SECONDS * 1000;
    // Pass requires full timer; Like requires 30s
    if (direction === 'left' && now < session.timerUnlocksAt) return;
    if (direction === 'right' && now < likeUnlocksAt) return;

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

    // Persist the like for logged-in users (independent of mutual outcome)
    try {
      const myIdx = session.users[0] === socket.id ? 0 : 1;
      const peerIdx = 1 - myIdx;
      const myUid = session.userIds?.[myIdx];
      const peerUid = session.userIds?.[peerIdx];
      if (myUid && peerUid) {
        recordLike(myUid, peerUid, {
          topic: session.topic,
          chemistry: session.chemistry
        });
      }
    } catch (err) { console.warn('like record failed', err); }

    const both = session.users.every(uid => session.swipes[uid] === 'right');
    if (both && !session.matched) {
      session.matched = true;
      session.matchDbId = recordMatch(session.users[0], session.users[1], session.chemistry);
      const [aSocket, bSocket] = session.users;
      const [aUid, bUid] = session.userIds || [null, null];
      // Auto-create conversation when both users are signed in
      let convoId = null;
      if (aUid && bUid) {
        try { convoId = ensureConversation(aUid, bUid); } catch { /* noop */ }
      }
      io.to(aSocket).emit('matched', { matchId: session.matchDbId, chemistry: session.chemistry, peerUserId: bUid, conversationId: convoId });
      io.to(bSocket).emit('matched', { matchId: session.matchDbId, chemistry: session.chemistry, peerUserId: aUid, conversationId: convoId });
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
    // Also record in admin moderation queue with user IDs if available
    const idxA = session.users[0] === socket.id ? 0 : 1;
    const idxB = 1 - idxA;
    recordContentReport({
      reporter_user_id: session.userIds?.[idxA] ?? null,
      reported_user_id: session.userIds?.[idxB] ?? null,
      reporter_socket: socket.id,
      reported_socket: peer,
      kind: 'user',
      detail: typeof reason === 'string' ? reason.slice(0, 500) : null
    });
    endSession(session.id, 'reported');
  });

  socket.on('disconnect', () => {
    const idx = queue.findIndex(q => q.socketId === socket.id);
    if (idx !== -1) queue.splice(idx, 1);

    if (socket.userId) {
      const set = userSockets.get(socket.userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) userSockets.delete(socket.userId);
      }
    }

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
