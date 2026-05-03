import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useWebRTC } from './useWebRTC';
import { useSpeech } from './useSpeech';
import { nextChemistry, scoreText } from './sentiment';
import { VideoStage } from './components/VideoStage';
import { ChemistryMeter } from './components/ChemistryMeter';
import { Timer } from './components/Timer';
import { Controls } from './components/Controls';
import { ChatPanel, type ChatLine } from './components/ChatPanel';
import { MatchedOverlay } from './components/MatchedOverlay';
import { Landing } from './components/Landing';
import { ProfileEditor } from './components/ProfileEditor';
import { type Profile, loadProfile, saveProfile, sanitizeIncomingProfile } from './profile';

const SIGNAL_URL =
  (import.meta.env.VITE_SIGNAL_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

type Phase = 'idle' | 'queued' | 'connecting' | 'live' | 'matched';
type Role = 'initiator' | 'receiver';

interface SessionInfo {
  sessionId: string;
  role: Role;
  timerSeconds: number;
  startedAt: number;
}

export function App() {
  const [phase, setPhase] = useState<Phase>('idle');
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [chemistry, setChemistry] = useState(50);
  const [now, setNow] = useState(Date.now());
  const [chatLines, setChatLines] = useState<ChatLine[]>([]);
  const [swiped, setSwiped] = useState<'left' | 'right' | null>(null);
  const [peerLikedYou, setPeerLikedYou] = useState(false);
  const [peerContact, setPeerContact] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<'denied' | 'in-use' | 'unavailable' | null>(null);
  const [starting, setStarting] = useState(false);
  const [myProfile, setMyProfile] = useState<Profile | null>(() => loadProfile());
  const [peerProfile, setPeerProfile] = useState<Profile | null>(null);
  const [hasSentContact, setHasSentContact] = useState(false);
  const [showProfileEditor, setShowProfileEditor] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);

  const myProfileRef = useRef(myProfile);
  useEffect(() => { myProfileRef.current = myProfile; }, [myProfile]);

  const socketRef = useRef<Socket | null>(null);
  const chemistryRef = useRef(50);
  useEffect(() => { chemistryRef.current = chemistry; }, [chemistry]);

  // ---- Socket lifecycle ----
  useEffect(() => {
    const socket = io(SIGNAL_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('queued', () => setPhase('queued'));

    socket.on('paired', (info: { sessionId: string; role: Role; timerSeconds: number }) => {
      setSession({ ...info, startedAt: Date.now() });
      setChatLines([]);
      setSwiped(null);
      setPeerLikedYou(false);
      setPeerContact(null);
      setPeerProfile(null);
      setHasSentContact(false);
      setOverlayDismissed(false);
      setChemistry(50);
      setPhase('connecting');
    });

    socket.on('chemistry', ({ score }: { score: number }) => {
      setChemistry(score);
    });

    socket.on('peer-swiped-right', () => {
      setPeerLikedYou(true);
    });

    socket.on('peer-swiped-left', () => {
      setToast("They swiped left 💔");
    });

    socket.on('matched', ({ chemistry: c }: { chemistry: number }) => {
      setChemistry(c);
      setPhase('matched');
      setOverlayDismissed(false);
    });

    socket.on('peer-left', () => {
      setToast('They disconnected.');
    });

    socket.on('peer-contact', ({ contact }: { contact: string }) => {
      setPeerContact(contact);
    });

    socket.on('session-ended', ({ reason }: { reason: string }) => {
      // Match phase keeps the overlay open; user closes it manually.
      setSession(prev => {
        if (phaseRef.current === 'matched') return prev;
        return null;
      });
      if (phaseRef.current !== 'matched') {
        const msg =
          reason === 'rejected' ? 'No spark — finding someone new…' :
          reason === 'next' ? 'Skipped. Searching for next…' :
          reason === 'reported' ? 'Reported. Searching for next…' :
          reason === 'peer-disconnected' ? 'They left. Searching for next…' :
          'Searching for next…';
        setToast(msg);
        // Auto-requeue.
        setPhase('queued');
        socket.emit('join-queue');
      }
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, []);

  // Phase ref so socket handlers can read current phase without re-subscribing.
  const phaseRef = useRef(phase);
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // ---- Auto-clear toasts ----
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(null), 2400);
    return () => clearTimeout(id);
  }, [toast]);

  // ---- WebRTC ----
  const onChatMessage = useCallback((text: string) => {
    setChatLines(prev => [...prev, { from: 'them', text, ts: Date.now() }]);
    const s = scoreText(text);
    const next = nextChemistry(chemistryRef.current, s);
    chemistryRef.current = next;
    setChemistry(next);
    socketRef.current?.emit('chemistry-update', {
      sessionId: session?.sessionId,
      score: next
    });
  }, [session?.sessionId]);

  const onProfileReceived = useCallback((raw: unknown) => {
    const sanitized = sanitizeIncomingProfile(raw);
    setPeerProfile(sanitized);
  }, []);

  const { localStream, remoteStream, connectionState, sendChat, sendProfile, startMedia, stopAll } = useWebRTC({
    socket: socketRef.current,
    sessionId: session?.sessionId ?? null,
    role: session?.role ?? null,
    signalUrl: SIGNAL_URL,
    onChatMessage,
    onProfile: onProfileReceived
  });

  // Live speech-to-text on local mic — drives the chemistry meter from actual
  // spoken conversation, not just typed messages. Transcripts stay client-side;
  // only the numeric score is broadcast.
  const onSpokenTranscript = useCallback((text: string) => {
    const s = scoreText(text);
    if (s === 0) return; // skip neutral chunks to reduce noise
    const next = nextChemistry(chemistryRef.current, s);
    chemistryRef.current = next;
    setChemistry(next);
    socketRef.current?.emit('chemistry-update', {
      sessionId: session?.sessionId,
      score: next
    });
  }, [session?.sessionId]);

  const { supported: speechSupported, listening } = useSpeech({
    active: phase === 'live' || phase === 'matched',
    onTranscript: onSpokenTranscript
  });

  // When we transition to 'matched', send our profile to the peer.
  useEffect(() => {
    if (phase !== 'matched') return;
    const p = myProfileRef.current;
    if (!p) return;
    // Slight delay to let the matched event settle on both ends.
    const id = setTimeout(() => sendProfile(p), 200);
    return () => clearTimeout(id);
  }, [phase, sendProfile]);

  // Once WebRTC is connected, transition to "live".
  useEffect(() => {
    if (phase === 'connecting' && connectionState === 'connected') {
      setSession(prev => prev ? { ...prev, startedAt: Date.now() } : prev);
      setPhase('live');
    }
  }, [connectionState, phase]);

  // Tick clock for timer countdown.
  useEffect(() => {
    if (phase !== 'live') return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [phase]);

  // ---- Actions ----
  const startMatching = useCallback(async () => {
    setStarting(true);
    setMediaError(null);
    try {
      await startMedia(); // pre-warm camera before queueing
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') setMediaError('denied');
      else if (name === 'NotReadableError' || name === 'AbortError') setMediaError('in-use');
      else setMediaError('unavailable');
      setStarting(false);
      return;
    }
    setStarting(false);
    socketRef.current?.emit('join-queue');
  }, [startMedia]);

  const sendChatMessage = useCallback((text: string) => {
    sendChat(text);
    setChatLines(prev => [...prev, { from: 'me', text, ts: Date.now() }]);
    const s = scoreText(text);
    const next = nextChemistry(chemistryRef.current, s);
    chemistryRef.current = next;
    setChemistry(next);
    socketRef.current?.emit('chemistry-update', {
      sessionId: session?.sessionId,
      score: next
    });
  }, [sendChat, session?.sessionId]);

  const swipeLeft = useCallback(() => {
    if (!session) return;
    setSwiped('left');
    socketRef.current?.emit('swipe', { sessionId: session.sessionId, direction: 'left' });
  }, [session]);

  const swipeRight = useCallback(() => {
    if (!session) return;
    setSwiped('right');
    socketRef.current?.emit('swipe', { sessionId: session.sessionId, direction: 'right' });
  }, [session]);

  const next = useCallback(() => {
    if (!session) return;
    socketRef.current?.emit('next', { sessionId: session.sessionId });
  }, [session]);

  const report = useCallback(() => {
    if (!session) return;
    const reason = window.prompt('Reason for report? (optional)') ?? '';
    socketRef.current?.emit('report', { sessionId: session.sessionId, reason });
  }, [session]);

  const shareContact = useCallback((contact: string) => {
    if (!session) return;
    socketRef.current?.emit('share-contact', { sessionId: session.sessionId, contact });
    setHasSentContact(true);
  }, [session]);

  const handleSaveProfile = useCallback((p: Profile) => {
    saveProfile(p);
    setMyProfile(p);
    setShowProfileEditor(false);
  }, []);

  const leaveMatch = useCallback(() => {
    setPhase('idle');
    setSession(null);
    setPeerContact(null);
    setPeerProfile(null);
    setChatLines([]);
    setSwiped(null);
    setPeerLikedYou(false);
    setHasSentContact(false);
    setOverlayDismissed(false);
    stopAll();
  }, [stopAll]);

  const continueChatting = useCallback(() => {
    setOverlayDismissed(true);
  }, []);

  // ---- Timer math ----
  const secondsLeft = useMemo(() => {
    if (!session || phase !== 'live') return session?.timerSeconds ?? 120;
    const elapsed = (now - session.startedAt) / 1000;
    return Math.max(0, Math.ceil(session.timerSeconds - elapsed));
  }, [session, now, phase]);

  const unlocked = phase === 'live' && secondsLeft <= 0;

  // ---- Render ----
  if (phase === 'idle') {
    return (
      <>
        <Landing
          onStart={startMatching}
          starting={starting}
          mediaError={mediaError}
          onDismissError={() => setMediaError(null)}
          onEditProfile={() => setShowProfileEditor(true)}
          profile={myProfile}
        />
        {showProfileEditor && (
          <ProfileEditor
            initial={myProfile}
            onSave={handleSaveProfile}
            onCancel={() => setShowProfileEditor(false)}
          />
        )}
      </>
    );
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand-group">
          <div className="brand">Glimpse</div>
          {speechSupported && (
            <span
              className={`mic-indicator ${listening ? 'mic-on' : ''}`}
              title={listening ? 'Listening — chemistry reads your conversation' : 'Mic recognition idle'}
            >
              🎤
            </span>
          )}
        </div>
        <ChemistryMeter score={chemistry} />
        <Timer secondsLeft={secondsLeft} />
      </header>

      <main className="main">
        <VideoStage
          localStream={localStream}
          remoteStream={remoteStream}
          connecting={phase === 'connecting' || phase === 'queued'}
        />
        <ChatPanel
          lines={chatLines}
          onSend={sendChatMessage}
          disabled={phase !== 'live' && phase !== 'matched'}
        />
      </main>

      <footer className="footer">
        <Controls
          unlocked={unlocked}
          swiped={swiped}
          peerLikedYou={peerLikedYou}
          onSwipeLeft={swipeLeft}
          onSwipeRight={swipeRight}
          onNext={next}
          onReport={report}
        />
      </footer>

      {toast && <div className="toast">{toast}</div>}

      {phase === 'matched' && !overlayDismissed && (
        <MatchedOverlay
          chemistry={chemistry}
          peerProfile={peerProfile}
          myProfile={myProfile}
          peerContact={peerContact}
          hasSentContact={hasSentContact}
          onShareContact={shareContact}
          onContinue={continueChatting}
          onLeave={leaveMatch}
        />
      )}

      {phase === 'matched' && overlayDismissed && (
        <button
          className="reopen-match-btn"
          onClick={() => setOverlayDismissed(false)}
          title="Reopen match details"
        >
          💞 Match details
        </button>
      )}
    </div>
  );
}

