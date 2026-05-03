import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Routes, Route, useNavigate, Navigate, useLocation } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { useWebRTC } from './useWebRTC';
import { useSpeech } from './useSpeech';
import { useFaceAnalysis, type FaceFrame } from './useFaceAnalysis';
import { nextChemistry, scoreText } from './sentiment';
import { type CallStats, emptyStats } from './callStats';
import { VideoStage } from './components/VideoStage';
import { ChemistryMeter } from './components/ChemistryMeter';
import { Timer } from './components/Timer';
import { Controls } from './components/Controls';
import { ChatPanel, type ChatLine } from './components/ChatPanel';
import { MatchedOverlay } from './components/MatchedOverlay';
import { Landing } from './components/Landing';
import { ProfileEditor } from './components/ProfileEditor';
import { ResultsScreen } from './components/ResultsScreen';
import { LoginPage, SignupPage } from './components/AuthPages';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { SavedList } from './components/SavedList';
import { AICoach } from './components/AICoach';
import { Icebreaker } from './components/Icebreaker';
import { ConnectionIndicator } from './components/ConnectionIndicator';
import { CaptionsOverlay } from './components/CaptionsOverlay';
import { Reactions } from './components/Reactions';
import { CustomReactionCreator } from './components/CustomReactionCreator';
import { type Profile, sanitizeIncomingProfile, isFirstVisit, markVisited, getReactionPalette, getCustomReactions } from './profile';
import { useAuth } from './AuthContext';
import { saveConnection, getToken, moderateText } from './api';
import { Inbox, Conversation } from './components/Messaging';
import { Events } from './components/Events';
import { DashboardLayout } from './components/DashboardLayout';
import { ProfilePage } from './components/ProfilePage';
import { PreferencesPage } from './components/PreferencesPage';
import { Likes } from './components/Likes';
import { Upgrade } from './components/Upgrade';

const SIGNAL_URL =
  (import.meta.env.VITE_SIGNAL_URL as string | undefined) ??
  (import.meta.env.DEV ? 'http://localhost:3001' : window.location.origin);

type Phase = 'idle' | 'queued' | 'connecting' | 'live' | 'matched' | 'ended';
type Role = 'initiator' | 'receiver';

interface SessionInfo {
  sessionId: string;
  role: Role;
  timerSeconds: number;
  startedAt: number;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRoute />} />
      <Route path="/about" element={<AboutPage />} />
      <Route path="/match" element={<Match />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/signup" element={<SignupPage />} />
      <Route path="/settings" element={<DashLayoutWrapper><Settings /></DashLayoutWrapper>} />
      <Route path="/saved" element={<DashLayoutWrapper><SavedList /></DashLayoutWrapper>} />
      <Route path="/messages" element={<DashLayoutWrapper><Inbox /></DashLayoutWrapper>} />
      <Route path="/messages/:id" element={<Conversation />} />
      <Route path="/events" element={<DashLayoutWrapper><Events /></DashLayoutWrapper>} />
      <Route path="/profile" element={<DashLayoutWrapper><ProfilePage /></DashLayoutWrapper>} />
      <Route path="/preferences" element={<DashLayoutWrapper><PreferencesPage /></DashLayoutWrapper>} />
      <Route path="/likes" element={<DashLayoutWrapper><Likes /></DashLayoutWrapper>} />
      <Route path="/upgrade" element={<DashLayoutWrapper><Upgrade /></DashLayoutWrapper>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

/** First-time visitors land on /about (the marketing page);
 *  everyone else lands on the Dashboard. */
function HomeRoute() {
  const navigate = useNavigate();
  const [first] = useState(() => isFirstVisit());

  // Redirect first-time visitors to /about (one-time)
  useEffect(() => {
    if (first) navigate('/about', { replace: true });
  }, [first, navigate]);

  if (first) return null;
  return <DashboardPage />;
}

function DashboardPage() {
  const navigate = useNavigate();
  const handleStart = useCallback((topic: string) => {
    markVisited();
    navigate(`/match?topic=${encodeURIComponent(topic)}`);
  }, [navigate]);
  return (
    <DashboardLayout>
      <Dashboard onStart={handleStart} />
    </DashboardLayout>
  );
}

function DashLayoutWrapper({ children }: { children: React.ReactNode }) {
  return <DashboardLayout>{children}</DashboardLayout>;
}

function AboutPage() {
  const navigate = useNavigate();
  const { user, profile, setProfile, logout } = useAuth();
  const [showProfileEditor, setShowProfileEditor] = useState(false);

  const handleSaveProfile = useCallback(async (p: Profile) => {
    await setProfile(p);
    setShowProfileEditor(false);
  }, [setProfile]);

  const handleStart = useCallback(() => {
    markVisited();
    navigate('/match');
  }, [navigate]);

  return (
    <>
      <Landing
        onStart={handleStart}
        starting={false}
        mediaError={null}
        onDismissError={() => {}}
        onEditProfile={() => setShowProfileEditor(true)}
        profile={profile}
        user={user}
        onLogout={logout}
      />
      {showProfileEditor && (
        <ProfileEditor
          initial={profile}
          onSave={handleSaveProfile}
          onCancel={() => setShowProfileEditor(false)}
        />
      )}
    </>
  );
}

function Match() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile: authProfile, setProfile } = useAuth();

  // Topic comes from query string ?topic=...
  const topic = useMemo(() => {
    const params = new URLSearchParams(location.search);
    return params.get('topic') || 'any';
  }, [location.search]);

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
  const myProfile = authProfile;
  const [peerProfile, setPeerProfile] = useState<Profile | null>(null);
  const [hasSentContact, setHasSentContact] = useState(false);
  const [overlayDismissed, setOverlayDismissed] = useState(false);
  const [peerUserId, setPeerUserId] = useState<number | null>(null);
  const [recentTranscripts, setRecentTranscripts] = useState<string[]>([]);
  const [savedPeer, setSavedPeer] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [reactionCreatorOpen, setReactionCreatorOpen] = useState(false);
  const [captionsEnabled, setCaptionsEnabled] = useState(false);
  const [incomingCaption, setIncomingCaption] = useState<{ text: string; at: number } | null>(null);
  const incomingReactionRef = useRef<((emoji: string) => void) | null>(null);
  const [stats, setStats] = useState<CallStats | null>(null);
  const [resultsStats, setResultsStats] = useState<CallStats | null>(null);
  const [localVideoEl, setLocalVideoEl] = useState<HTMLVideoElement | null>(null);

  const myProfileRef = useRef(myProfile);
  const statsRef = useRef<CallStats | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);
  useEffect(() => { myProfileRef.current = myProfile; }, [myProfile]);
  useEffect(() => { statsRef.current = stats; }, [stats]);
  useEffect(() => { sessionRef.current = session; }, [session]);

  const socketRef = useRef<Socket | null>(null);
  const chemistryRef = useRef(50);
  useEffect(() => { chemistryRef.current = chemistry; }, [chemistry]);

  // ---- Socket lifecycle ----
  useEffect(() => {
    const token = getToken();
    const socket = io(SIGNAL_URL, {
      transports: ['websocket'],
      auth: token ? { token } : undefined
    });
    socketRef.current = socket;

    socket.on('queued', () => setPhase('queued'));

    socket.on('quota-exceeded', ({ limit }: { used: number; limit: number }) => {
      setPhase('idle');
      setToast(`Daily call limit reached (${limit}/day on free). Upgrade for unlimited.`);
      navigate('/upgrade');
    });

    socket.on('paired', (info: { sessionId: string; role: Role; timerSeconds: number; peerUserId?: number | null }) => {
      setSession({ sessionId: info.sessionId, role: info.role, timerSeconds: info.timerSeconds, startedAt: Date.now() });
      setPeerUserId(info.peerUserId ?? null);
      setChatLines([]);
      setSwiped(null);
      setPeerLikedYou(false);
      setPeerContact(null);
      setPeerProfile(null);
      setPeerUserId(null);
      setHasSentContact(false);
      setOverlayDismissed(false);
      setChemistry(50);
      setStats(emptyStats());
      setResultsStats(null);
      setRecentTranscripts([]);
      setSavedPeer(false);
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
      setStats(prev => prev ? { ...prev, outcome: 'rejected-by-them' } : prev);
    });

    socket.on('matched', ({ chemistry: c, peerUserId: pUid }: { chemistry: number; peerUserId?: number | null }) => {
      setChemistry(c);
      setPeerUserId(pUid ?? null);
      setPhase('matched');
      setOverlayDismissed(false);
    });

    socket.on('peer-left', () => {
      setToast('They disconnected.');
      setStats(prev => prev ? { ...prev, outcome: 'peer-left' } : prev);
    });

    socket.on('peer-contact', ({ contact }: { contact: string }) => {
      setPeerContact(contact);
    });

    socket.on('session-ended', ({ reason }: { reason: string }) => {
      // 'matched' phase ignores session-ended — user closes the overlay manually.
      if (phaseRef.current === 'matched') return;

      // Snapshot current stats with finalized outcome and freeze for results.
      setStats(prev => {
        if (!prev) return prev;
        const finalOutcome: CallStats['outcome'] =
          prev.outcome !== 'ended-other' ? prev.outcome :
          reason === 'rejected' ? 'rejected-by-them' :
          reason === 'next' ? 'next' :
          reason === 'peer-disconnected' ? 'peer-left' :
          'ended-other';
        const finalized: CallStats = {
          ...prev,
          endedAt: Date.now(),
          outcome: finalOutcome,
          finalChemistry: chemistryRef.current
        };
        setResultsStats(finalized);
        return finalized;
      });

      setSession(null);
      setPhase('ended');
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

  // ---- Chemistry update helper (server is source of truth, we also track history) ----
  const applyChemistryDelta = useCallback((newScore: number) => {
    chemistryRef.current = newScore;
    setChemistry(newScore);
    socketRef.current?.emit('chemistry-update', {
      sessionId: sessionRef.current?.sessionId,
      score: newScore
    });
    setStats(prev => {
      if (!prev) return prev;
      const ts = Date.now();
      const last = prev.chemistryHistory[prev.chemistryHistory.length - 1];
      // Throttle: only push a new point every ~500ms
      const history = (last && ts - last.t < 500)
        ? prev.chemistryHistory
        : [...prev.chemistryHistory, { t: ts, score: newScore }];
      const peak = Math.max(prev.peakChemistry, newScore);
      const totalDuration = history.length > 1 ? history[history.length - 1].t - history[0].t : 0;
      // Time-weighted average via trapezoidal integration
      let area = 0;
      for (let i = 1; i < history.length; i++) {
        const dt = history[i].t - history[i - 1].t;
        area += ((history[i].score + history[i - 1].score) / 2) * dt;
      }
      const avg = totalDuration > 0 ? area / totalDuration : newScore;
      return {
        ...prev,
        chemistryHistory: history,
        peakChemistry: peak,
        avgChemistry: avg,
        finalChemistry: newScore
      };
    });
  }, []);

  // ---- WebRTC ----
  const onChatMessage = useCallback((text: string) => {
    setChatLines(prev => [...prev, { from: 'them', text, ts: Date.now() }]);
    setStats(prev => prev ? { ...prev, messagesReceived: prev.messagesReceived + 1 } : prev);
    setRecentTranscripts(prev => [...prev, `(them) ${text}`].slice(-15));
    const s = scoreText(text);
    applyChemistryDelta(nextChemistry(chemistryRef.current, s));
  }, [applyChemistryDelta]);

  const onProfileReceived = useCallback((raw: unknown) => {
    const sanitized = sanitizeIncomingProfile(raw);
    setPeerProfile(sanitized);
  }, []);

  const onReactionReceived = useCallback((emoji: string) => {
    if (typeof emoji !== 'string' || emoji.length === 0) return;
    // Allow short unicode emoji or small image data URLs only (cap 80KB).
    if (emoji.startsWith('data:image/')) {
      if (emoji.length > 80_000) return;
    } else if (emoji.length > 32) {
      return; // unicode reactions are tiny — anything longer is suspect
    }
    incomingReactionRef.current?.(emoji);
  }, []);

  const {
    localStream, remoteStream, connectionState,
    sendChat, sendProfile, sendReaction, sendData,
    quality, rttMs,
    toggleAudio, toggleVideo, audioEnabled, videoEnabled,
    startMedia, stopAll
  } = useWebRTC({
    socket: socketRef.current,
    sessionId: session?.sessionId ?? null,
    role: session?.role ?? null,
    signalUrl: SIGNAL_URL,
    onChatMessage,
    onProfile: onProfileReceived,
    onReaction: onReactionReceived,
    onData: (payload: any) => {
      if (payload?.type === 'caption' && typeof payload.text === 'string') {
        setIncomingCaption({ text: payload.text.slice(0, 240), at: Date.now() });
      }
    }
  });

  // Live speech-to-text on local mic — drives the chemistry meter from actual
  // spoken conversation, not just typed messages. Transcripts normally stay
  // client-side; we only forward them to the peer when *they* have captions on
  // (we send unconditionally; their UI decides whether to render).
  const captionsEnabledRef = useRef(captionsEnabled);
  useEffect(() => { captionsEnabledRef.current = captionsEnabled; }, [captionsEnabled]);
  const onSpokenTranscript = useCallback((text: string) => {
    setStats(prev => prev ? { ...prev, spokenChunks: prev.spokenChunks + 1 } : prev);
    setRecentTranscripts(prev => [...prev, text].slice(-15));
    // Always send caption so the peer can choose to display it. Caption text is
    // small so it's fine to send without coordinating capability flags.
    sendData({ type: 'caption', text });
    const s = scoreText(text);
    if (s === 0) return; // skip neutral chunks to reduce noise
    applyChemistryDelta(nextChemistry(chemistryRef.current, s));
  }, [applyChemistryDelta, sendData]);

  const { supported: speechSupported, listening } = useSpeech({
    active: phase === 'live' || phase === 'matched',
    onTranscript: onSpokenTranscript
  });

  // Face analysis — runs locally on your own video. Updates stats every frame
  // and nudges the chemistry meter from a smoothed multi-second window.
  // We average over ~3s (not 1s) and require a meaningful signal to avoid
  // making the bar twitch on every blink/expression flicker.
  const lastFaceTickRef = useRef(0);
  const faceWindowRef = useRef<FaceFrame[]>([]);
  const onFaceFrame = useCallback((f: FaceFrame) => {
    setStats(prev => {
      if (!prev) return prev;
      const next: CallStats = {
        ...prev,
        totalFaceSamples: prev.totalFaceSamples + 1,
        faceFrames: prev.faceFrames + (f.hasFace ? 1 : 0),
        smileFrames: prev.smileFrames + (f.hasFace && f.smile > 0.35 ? 1 : 0),
        attentionFrames: prev.attentionFrames + (f.hasFace && f.attention > 0.65 ? 1 : 0),
        surpriseFrames: prev.surpriseFrames + (f.hasFace && f.surprise > 0.35 ? 1 : 0)
      };
      return next;
    });

    if (f.hasFace) faceWindowRef.current.push(f);

    // Average a wider window (~3s, ~18 samples at 6fps) into one chemistry
    // signal. This keeps the meter responsive to *sustained* expressions
    // rather than every single blink.
    const now = Date.now();
    if (now - lastFaceTickRef.current < 3000) return;
    lastFaceTickRef.current = now;
    const w = faceWindowRef.current;
    if (w.length < 6) return; // not enough sustained data — skip
    const avgSmile = w.reduce((a, x) => a + x.smile, 0) / w.length;
    const avgAttention = w.reduce((a, x) => a + x.attention, 0) / w.length;
    const avgSurprise = w.reduce((a, x) => a + x.surprise, 0) / w.length;
    faceWindowRef.current = [];

    // Build a sentiment-equivalent signal in [-1, 1]. Magnitudes are
    // intentionally modest — face is a supporting signal, not the lead.
    let signal = 0;
    if (avgSmile > 0.45) signal += 0.35;
    else if (avgSmile > 0.25) signal += 0.15;
    if (avgSurprise > 0.4) signal += 0.15;
    if (avgAttention > 0.7) signal += 0.08;
    else if (avgAttention < 0.35) signal -= 0.12;
    signal = Math.max(-1, Math.min(1, signal));

    if (Math.abs(signal) < 0.12) return; // ignore weak signals
    applyChemistryDelta(nextChemistry(chemistryRef.current, signal));
  }, [applyChemistryDelta]);

  const { ready: faceReady } = useFaceAnalysis({
    active: phase === 'live' || phase === 'matched',
    videoEl: localVideoEl,
    onFrame: onFaceFrame
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

  // Tick clock for timer countdown — keep going through 'matched' too so the
  // timer doesn't snap back to 2:00 after a successful match.
  useEffect(() => {
    if (phase !== 'live' && phase !== 'matched') return;
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
    const prefs = authProfile ? {
      gender: authProfile.gender,
      age: authProfile.age,
      looking_for: authProfile.looking_for,
      age_min: authProfile.age_min,
      age_max: authProfile.age_max
    } : null;
    socketRef.current?.emit('join-queue', { topic, prefs });
  }, [startMedia, topic, authProfile]);

  // Auto-start matching when this route mounts.
  const autoStartedRef = useRef(false);
  useEffect(() => {
    if (autoStartedRef.current) return;
    autoStartedRef.current = true;
    // Tiny delay so socket is connected first
    const id = setTimeout(() => { startMatching(); }, 100);
    return () => clearTimeout(id);
  }, [startMatching]);

  // Cleanup on unmount: leave queue / end session, stop streams.
  useEffect(() => {
    return () => {
      const sock = socketRef.current;
      if (sock) {
        sock.emit('leave-queue');
        const sId = sessionRef.current?.sessionId;
        if (sId) sock.emit('next', { sessionId: sId });
      }
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendChatMessage = useCallback(async (text: string) => {
    // Best-effort text moderation. If OpenAI key isn't configured server-side,
    // this returns flagged:false and we just send normally.
    try {
      const mod = await moderateText(text);
      if (mod.flagged) {
        setToast('That message was blocked. Keep it kind.');
        return;
      }
    } catch { /* ignore — don't block on moderation errors */ }

    sendChat(text);
    setChatLines(prev => [...prev, { from: 'me', text, ts: Date.now() }]);
    setStats(prev => prev ? { ...prev, messagesSent: prev.messagesSent + 1 } : prev);
    setRecentTranscripts(prev => [...prev, `(me) ${text}`].slice(-15));
    const s = scoreText(text);
    applyChemistryDelta(nextChemistry(chemistryRef.current, s));
  }, [sendChat, applyChemistryDelta]);

  // Timer math. Keeps counting through 'matched' so the displayed time doesn't
  // reset on a successful match — the call continues, the clock should too.
  const secondsLeft = useMemo(() => {
    if (!session || (phase !== 'live' && phase !== 'matched')) {
      return session?.timerSeconds ?? 120;
    }
    const elapsed = (now - session.startedAt) / 1000;
    return Math.max(0, Math.ceil(session.timerSeconds - elapsed));
  }, [session, now, phase]);

  // Pass becomes "Pass" only at full timer end; before that it's "Skip"
  const passUnlocked = phase === 'live' && secondsLeft <= 0;
  // Like unlocks 30s into the call
  const likeUnlockSeconds = 30;
  const elapsedSec = session && phase === 'live'
    ? Math.floor((now - session.startedAt) / 1000)
    : 0;
  const likeUnlocked = phase === 'live' && elapsedSec >= likeUnlockSeconds;
  const likeUnlockInSeconds = phase === 'live'
    ? Math.max(0, likeUnlockSeconds - elapsedSec)
    : likeUnlockSeconds;

  // Backward compat for handlePass / handleLike below
  const unlocked = passUnlocked;

  const handlePass = useCallback(() => {
    if (!session) return;
    if (unlocked) {
      // Real swipe-left after the timer — counts as "you-rejected"
      setSwiped('left');
      setStats(prev => prev ? { ...prev, outcome: 'you-rejected' } : prev);
      socketRef.current?.emit('swipe', { sessionId: session.sessionId, direction: 'left' });
    } else {
      // Skip before timer — counts as "next"
      setStats(prev => prev ? { ...prev, outcome: 'next' } : prev);
      socketRef.current?.emit('next', { sessionId: session.sessionId });
    }
  }, [session, unlocked]);

  const handleLike = useCallback(() => {
    if (!session || !likeUnlocked) return;
    setSwiped('right');
    socketRef.current?.emit('swipe', { sessionId: session.sessionId, direction: 'right' });
  }, [session, likeUnlocked]);

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
    navigate('/');
  }, [stopAll, navigate]);

  const continueChatting = useCallback(() => {
    setOverlayDismissed(true);
  }, []);

  const savePeer = useCallback(async () => {
    if (!peerUserId || !user) return;
    try {
      await saveConnection(peerUserId);
      setSavedPeer(true);
    } catch (err) {
      console.warn('save failed', err);
    }
  }, [peerUserId, user]);

  const goAgain = useCallback(() => {
    setResultsStats(null);
    setStats(null);
    setPhase('queued');
    const prefs = authProfile ? {
      gender: authProfile.gender,
      age: authProfile.age,
      looking_for: authProfile.looking_for,
      age_min: authProfile.age_min,
      age_max: authProfile.age_max
    } : null;
    socketRef.current?.emit('join-queue', { topic, prefs });
  }, [topic, authProfile]);

  const doneFromResults = useCallback(() => {
    setResultsStats(null);
    setStats(null);
    setPhase('idle');
    setSession(null);
    setPeerContact(null);
    setPeerProfile(null);
    setChatLines([]);
    setSwiped(null);
    setPeerLikedYou(false);
    setHasSentContact(false);
    stopAll();
    navigate('/');
  }, [stopAll, navigate]);

  // ---- Render ----
  if (phase === 'ended' && resultsStats) {
    return (
      <ResultsScreen
        stats={resultsStats}
        onGoAgain={goAgain}
        onDone={doneFromResults}
        canSave={!!user && !!peerUserId}
        saved={savedPeer}
        onSavePeer={savePeer}
      />
    );
  }

  if (mediaError) {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon">📵</div>
          <h2>{
            mediaError === 'denied' ? 'Camera & mic blocked' :
            mediaError === 'in-use' ? 'Camera is busy' :
            "Couldn't reach your camera"
          }</h2>
          <p>{
            mediaError === 'denied' ? "Click the camera icon in your browser's address bar, allow access, then try again." :
            mediaError === 'in-use' ? 'Another tab or app is using your camera. Close it and try again.' :
            'Make sure a camera and microphone are connected, then try again.'
          }</p>
          <button className="cta-primary" onClick={() => { setMediaError(null); startMatching(); }}>
            Try again
          </button>
          <button className="leave-btn" onClick={() => navigate('/')} style={{ marginTop: 12 }}>
            Back to home
          </button>
        </div>
      </div>
    );
  }

  const unreadCount = 0; // chat is currently always-visible; could add later

  return (
    <div className="app app-immersive">
      <VideoStage
        localStream={localStream}
        remoteStream={remoteStream}
        connecting={phase === 'connecting' || phase === 'queued'}
        audioEnabled={audioEnabled}
        videoEnabled={videoEnabled}
        onLocalVideoEl={setLocalVideoEl}
      />

      <header className="topbar topbar-floating">
        <button className="topbar-back" onClick={leaveMatch} title="End call and go back to homepage">
          <span className="topbar-back-arrow">←</span>
          <span className="topbar-back-label">Back</span>
        </button>
        <ChemistryMeter score={chemistry} />
        <Timer secondsLeft={secondsLeft} matched={phase === 'matched'} />
        <ConnectionIndicator quality={quality} rttMs={rttMs} />
        {user?.premium ? (
          <button
            className={`topbar-cc ${captionsEnabled ? 'is-on' : ''}`}
            onClick={() => setCaptionsEnabled(v => !v)}
            title={captionsEnabled ? 'Hide live captions' : 'Show live captions'}
          >
            CC
          </button>
        ) : (
          <button
            className="topbar-cc topbar-cc-locked"
            onClick={() => navigate('/upgrade')}
            title="Live captions are a Glimpse+ perk"
          >
            CC <span className="topbar-cc-lock">✨</span>
          </button>
        )}
        <button className="topbar-report" onClick={report} title="Report this user">
          🚩
        </button>
      </header>

      <button
        className={`chat-toggle ${chatOpen ? 'is-active' : ''}`}
        onClick={() => setChatOpen(o => !o)}
        title={chatOpen ? 'Close chat' : 'Open chat'}
      >
        💬
        {!chatOpen && chatLines.length > 0 && (
          <span className="chat-toggle-count">{chatLines.length}</span>
        )}
      </button>

      <ChatPanel
        lines={chatLines}
        onSend={sendChatMessage}
        disabled={phase !== 'live' && phase !== 'matched'}
        open={chatOpen}
        onClose={() => setChatOpen(false)}
      />

      <Reactions
        onSend={(emoji) => sendReaction(emoji)}
        registerIncoming={(handler) => { incomingReactionRef.current = handler; }}
        disabled={phase !== 'live' && phase !== 'matched'}
        palette={getReactionPalette(myProfile)}
        customReactions={user?.premium ? getCustomReactions(myProfile) : []}
        onOpenCreator={user?.premium ? () => setReactionCreatorOpen(true) : undefined}
      />

      {reactionCreatorOpen && (
        <CustomReactionCreator
          existing={getCustomReactions(myProfile)}
          onClose={() => setReactionCreatorOpen(false)}
          onSave={async (next) => {
            const updated: Profile = { ...(myProfile ?? {}), custom_reactions: next };
            await setProfile(updated);
            setReactionCreatorOpen(false);
          }}
        />
      )}

      <footer className="footer footer-floating">
        <Controls
          passUnlocked={passUnlocked}
          likeUnlocked={likeUnlocked}
          likeUnlockInSeconds={likeUnlockInSeconds}
          swiped={swiped}
          peerLikedYou={peerLikedYou}
          audioEnabled={audioEnabled}
          videoEnabled={videoEnabled}
          onPass={handlePass}
          onLike={handleLike}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
        />
      </footer>

      <Icebreaker
        topic={topic}
        elapsedSec={elapsedSec}
        hidden={phase !== 'live'}
      />

      <CaptionsOverlay caption={incomingCaption} enabled={captionsEnabled && (phase === 'live' || phase === 'matched')} />

      <AICoach
        active={phase === 'live' && !!user?.premium}
        topic={topic}
        secondsLeft={secondsLeft}
        recentTranscripts={recentTranscripts}
      />

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

