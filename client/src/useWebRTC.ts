import { useCallback, useEffect, useRef, useState } from 'react';
import type { Socket } from 'socket.io-client';

type Role = 'initiator' | 'receiver';

const FALLBACK_ICE: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' }
];

let iceServersCache: { servers: RTCIceServer[]; fetchedAt: number } | null = null;

async function loadIceServers(signalUrl: string): Promise<RTCIceServer[]> {
  // Cache for 45 min — Twilio tokens last 60 min on the server.
  if (iceServersCache && Date.now() - iceServersCache.fetchedAt < 45 * 60 * 1000) {
    return iceServersCache.servers;
  }
  try {
    const res = await fetch(`${signalUrl.replace(/\/$/, '')}/ice-servers`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    if (Array.isArray(body.iceServers) && body.iceServers.length > 0) {
      iceServersCache = { servers: body.iceServers, fetchedAt: Date.now() };
      return body.iceServers;
    }
  } catch (err) {
    console.warn('ICE server fetch failed, using fallback STUN', err);
  }
  return FALLBACK_ICE;
}

export interface UseWebRTCOpts {
  socket: Socket | null;
  sessionId: string | null;
  role: Role | null;
  signalUrl: string;
  onChatMessage: (msg: string) => void;
  onProfile: (profile: unknown) => void;
  onReaction?: (emoji: string) => void;
  /** Generic data-channel listener for app-level messages (e.g. captions). */
  onData?: (payload: any) => void;
}

export type ConnectionQuality = 'good' | 'ok' | 'poor' | 'lost' | 'unknown';

export interface UseWebRTC {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'idle';
  /** Aggregated network quality, sampled every ~3s during a live connection. */
  quality: ConnectionQuality;
  /** RTT in ms (most recent sample). null if unavailable. */
  rttMs: number | null;
  /** Per-channel send (custom messages with arbitrary payloads — captions etc) */
  sendData: (payload: unknown) => void;
  sendChat: (msg: string) => void;
  sendProfile: (profile: unknown) => void;
  sendReaction: (emoji: string) => void;
  toggleAudio: () => boolean; // returns new "audio enabled" state
  toggleVideo: () => boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  startMedia: () => Promise<MediaStream>;
  stopAll: () => void;
}

export function useWebRTC(opts: UseWebRTCOpts): UseWebRTC {
  const { socket, sessionId, role, signalUrl, onChatMessage, onProfile, onReaction, onData } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);
  const restartAttemptedRef = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState | 'idle'>('idle');
  const [quality, setQuality] = useState<ConnectionQuality>('unknown');
  const [rttMs, setRttMs] = useState<number | null>(null);

  const onChatMessageRef = useRef(onChatMessage);
  const onProfileRef = useRef(onProfile);
  const onReactionRef = useRef(onReaction);
  const onDataRef = useRef(onData);
  useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);
  useEffect(() => { onProfileRef.current = onProfile; }, [onProfile]);
  useEffect(() => { onReactionRef.current = onReaction; }, [onReaction]);
  useEffect(() => { onDataRef.current = onData; }, [onData]);

  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);

  const startMedia = useCallback(async () => {
    if (localStreamRef.current) return localStreamRef.current;
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: true
    });
    localStreamRef.current = stream;
    setLocalStream(stream);
    return stream;
  }, []);

  const wireDataChannel = useCallback((dc: RTCDataChannel) => {
    dcRef.current = dc;
    dc.onmessage = (ev) => {
      try {
        const parsed = JSON.parse(ev.data);
        if (parsed.type === 'chat' && typeof parsed.text === 'string') {
          onChatMessageRef.current(parsed.text);
        } else if (parsed.type === 'profile') {
          onProfileRef.current(parsed.profile);
        } else if (parsed.type === 'reaction' && typeof parsed.emoji === 'string') {
          onReactionRef.current?.(parsed.emoji);
        } else {
          onDataRef.current?.(parsed);
        }
      } catch {
        // ignore
      }
    };
  }, []);

  const teardownPeer = useCallback(() => {
    if (dcRef.current) {
      try { dcRef.current.close(); } catch {}
      dcRef.current = null;
    }
    if (pcRef.current) {
      const t = (pcRef.current as any).__statsTimer;
      if (t) clearInterval(t);
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.onconnectionstatechange = null;
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    pendingCandidates.current = [];
    remoteDescSet.current = false;
    restartAttemptedRef.current = false;
    setRemoteStream(null);
    setConnectionState('idle');
    setQuality('unknown');
    setRttMs(null);
  }, []);

  const stopAll = useCallback(() => {
    teardownPeer();
    if (localStreamRef.current) {
      for (const t of localStreamRef.current.getTracks()) t.stop();
      localStreamRef.current = null;
      setLocalStream(null);
    }
  }, [teardownPeer]);

  const sendChat = useCallback((msg: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    dc.send(JSON.stringify({ type: 'chat', text: msg }));
  }, []);

  const sendProfile = useCallback((profile: unknown) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    try { dc.send(JSON.stringify({ type: 'profile', profile })); }
    catch (err) { console.warn('sendProfile failed', err); }
  }, []);

  const sendReaction = useCallback((emoji: string) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    try { dc.send(JSON.stringify({ type: 'reaction', emoji })); } catch { /* noop */ }
  }, []);

  const sendData = useCallback((payload: unknown) => {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') return;
    try { dc.send(JSON.stringify(payload)); } catch { /* noop */ }
  }, []);

  const toggleAudio = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return audioEnabled;
    const next = !audioEnabled;
    for (const t of stream.getAudioTracks()) t.enabled = next;
    setAudioEnabled(next);
    return next;
  }, [audioEnabled]);

  const toggleVideo = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return videoEnabled;
    const next = !videoEnabled;
    for (const t of stream.getVideoTracks()) t.enabled = next;
    setVideoEnabled(next);
    return next;
  }, [videoEnabled]);

  // Build / tear down the peer connection whenever a session begins or ends.
  useEffect(() => {
    if (!socket || !sessionId || !role) {
      teardownPeer();
      return;
    }

    let cancelled = false;

    (async () => {
      const stream = await startMedia();
      if (cancelled) return;

      const iceServers = await loadIceServers(signalUrl);
      if (cancelled) return;

      const pc = new RTCPeerConnection({ iceServers });
      pcRef.current = pc;

      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }

      const remote = new MediaStream();
      setRemoteStream(remote);

      pc.ontrack = (ev) => {
        for (const track of ev.streams[0]?.getTracks() ?? [ev.track]) {
          if (!remote.getTracks().find(t => t.id === track.id)) {
            remote.addTrack(track);
          }
        }
        setRemoteStream(new MediaStream(remote.getTracks()));
      };

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          socket.emit('signal', {
            sessionId,
            data: { kind: 'ice', candidate: ev.candidate.toJSON() }
          });
        }
      };

      pc.onconnectionstatechange = () => {
        setConnectionState(pc.connectionState);
        const s = pc.connectionState;
        if (s === 'failed' || s === 'disconnected') {
          setQuality(s === 'failed' ? 'lost' : 'poor');
          // One-shot ICE restart attempt — only the initiator drives this.
          if (role === 'initiator' && !restartAttemptedRef.current) {
            restartAttemptedRef.current = true;
            (async () => {
              try {
                const offer = await pc.createOffer({ iceRestart: true });
                await pc.setLocalDescription(offer);
                socket.emit('signal', { sessionId, data: { kind: 'offer', sdp: offer } });
              } catch (err) {
                console.warn('ICE restart failed', err);
              }
            })();
          }
        } else if (s === 'connected') {
          restartAttemptedRef.current = false;
          setQuality('good');
        }
      };

      // Periodic getStats() poll for an aggregate quality reading.
      const statsTimer = window.setInterval(async () => {
        if (!pcRef.current) return;
        try {
          const stats = await pcRef.current.getStats();
          let rtt: number | null = null;
          let packetsLost = 0;
          let packetsReceived = 0;
          stats.forEach((report: any) => {
            if (report.type === 'candidate-pair' && report.state === 'succeeded' && report.nominated) {
              if (typeof report.currentRoundTripTime === 'number') {
                rtt = Math.round(report.currentRoundTripTime * 1000);
              }
            }
            if (report.type === 'inbound-rtp' && (report.kind === 'audio' || report.kind === 'video')) {
              if (typeof report.packetsLost === 'number') packetsLost += report.packetsLost;
              if (typeof report.packetsReceived === 'number') packetsReceived += report.packetsReceived;
            }
          });
          setRttMs(rtt);
          // Loss ratio over the lifetime of the call — good enough for a coarse indicator.
          const lossRatio = packetsReceived > 0 ? packetsLost / (packetsLost + packetsReceived) : 0;
          if (pcRef.current.connectionState !== 'connected') {
            // leave quality as set by state handler
            return;
          }
          if (rtt != null && rtt > 400) setQuality('poor');
          else if (lossRatio > 0.06) setQuality('poor');
          else if ((rtt != null && rtt > 200) || lossRatio > 0.02) setQuality('ok');
          else setQuality('good');
        } catch {
          // ignore — stats can fail transiently
        }
      }, 3000);
      // Track on the pc so we can clear it in teardown.
      (pc as any).__statsTimer = statsTimer;

      if (role === 'initiator') {
        const dc = pc.createDataChannel('chat');
        wireDataChannel(dc);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { sessionId, data: { kind: 'offer', sdp: offer } });
      } else {
        pc.ondatachannel = (ev) => wireDataChannel(ev.channel);
      }
    })().catch((err) => {
      console.error('WebRTC setup failed', err);
    });

    const onSignal = async ({ data }: { from: string; data: any }) => {
      const pc = pcRef.current;
      if (!pc) return;
      try {
        if (data.kind === 'offer') {
          await pc.setRemoteDescription(data.sdp);
          remoteDescSet.current = true;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          socket.emit('signal', { sessionId, data: { kind: 'answer', sdp: answer } });
          for (const c of pendingCandidates.current) await pc.addIceCandidate(c);
          pendingCandidates.current = [];
        } else if (data.kind === 'answer') {
          await pc.setRemoteDescription(data.sdp);
          remoteDescSet.current = true;
          for (const c of pendingCandidates.current) await pc.addIceCandidate(c);
          pendingCandidates.current = [];
        } else if (data.kind === 'ice') {
          if (remoteDescSet.current) {
            await pc.addIceCandidate(data.candidate);
          } else {
            pendingCandidates.current.push(data.candidate);
          }
        }
      } catch (err) {
        console.error('Signal handling error', err);
      }
    };

    socket.on('signal', onSignal);

    return () => {
      cancelled = true;
      socket.off('signal', onSignal);
      teardownPeer();
    };
  }, [socket, sessionId, role, signalUrl, startMedia, wireDataChannel, teardownPeer]);

  return {
    localStream, remoteStream, connectionState,
    quality, rttMs,
    sendChat, sendProfile, sendReaction, sendData,
    toggleAudio, toggleVideo, audioEnabled, videoEnabled,
    startMedia, stopAll
  };
}
