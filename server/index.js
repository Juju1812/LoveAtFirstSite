import express from 'express';
import http from 'node:http';
import cors from 'cors';
import { Server } from 'socket.io';
import { recordMatch, recordContact, recordReport } from './db.js';

const PORT = process.env.PORT || 3001;
const TIMER_SECONDS = 60;

const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);
const corsOrigin = allowedOrigins.includes('*') ? '*' : allowedOrigins;

const app = express();
app.use(cors({ origin: corsOrigin }));
app.use(express.json());

app.get('/health', (_req, res) => res.json({ ok: true }));

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: corsOrigin, methods: ['GET', 'POST'] }
});

/**
 * In-memory session state. Nothing about a live conversation is persisted —
 * only the final match record (when both users swipe right) and reports
 * land in SQLite. The rest is ephemeral by design.
 */
const queue = [];                    // socket ids waiting for a partner
const sessions = new Map();          // sessionId -> session
const userToSession = new Map();     // socketId -> sessionId

function makeSessionId() {
  return 'sess_' + Math.random().toString(36).slice(2, 10);
}

function pairUp() {
  // Pull the two oldest still-connected sockets off the queue.
  while (queue.length >= 2) {
    const aId = queue.shift();
    const bId = queue.shift();
    const a = io.sockets.sockets.get(aId);
    const b = io.sockets.sockets.get(bId);
    if (!a) { if (b) queue.unshift(b.id); continue; }
    if (!b) { queue.unshift(a.id); return; }

    const sessionId = makeSessionId();
    const session = {
      id: sessionId,
      users: [a.id, b.id],
      // a is the "polite"/initiator, b waits for the offer.
      initiator: a.id,
      swipes: { [a.id]: null, [b.id]: null },
      chemistry: 50,
      startedAt: Date.now(),
      timerUnlocksAt: Date.now() + TIMER_SECONDS * 1000,
      matched: false,
      matchDbId: null
    };
    sessions.set(sessionId, session);
    userToSession.set(a.id, sessionId);
    userToSession.set(b.id, sessionId);

    a.join(sessionId);
    b.join(sessionId);

    a.emit('paired', { sessionId, peerId: b.id, role: 'initiator', timerSeconds: TIMER_SECONDS });
    b.emit('paired', { sessionId, peerId: a.id, role: 'receiver', timerSeconds: TIMER_SECONDS });
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
  socket.on('join-queue', () => {
    if (userToSession.has(socket.id)) return; // already paired
    if (!queue.includes(socket.id)) queue.push(socket.id);
    socket.emit('queued', { position: queue.indexOf(socket.id) + 1 });
    pairUp();
  });

  socket.on('leave-queue', () => {
    const idx = queue.indexOf(socket.id);
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
      io.to(session.id).emit('matched', {
        matchId: session.matchDbId,
        chemistry: session.chemistry
      });
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
    const idx = queue.indexOf(socket.id);
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
  console.log(`LoveAtFirstSite signaling server listening on http://localhost:${PORT}`);
});
