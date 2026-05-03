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
}

export interface UseWebRTC {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connectionState: RTCPeerConnectionState | 'idle';
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
  const { socket, sessionId, role, signalUrl, onChatMessage, onProfile, onReaction } = opts;

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const dcRef = useRef<RTCDataChannel | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const pendingCandidates = useRef<RTCIceCandidateInit[]>([]);
  const remoteDescSet = useRef(false);

  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] =
    useState<RTCPeerConnectionState | 'idle'>('idle');

  const onChatMessageRef = useRef(onChatMessage);
  const onProfileRef = useRef(onProfile);
  const onReactionRef = useRef(onReaction);
  useEffect(() => { onChatMessageRef.current = onChatMessage; }, [onChatMessage]);
  useEffect(() => { onProfileRef.current = onProfile; }, [onProfile]);
  useEffect(() => { onReactionRef.current = onReaction; }, [onReaction]);

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
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.ondatachannel = null;
      pcRef.current.onconnectionstatechange = null;
      try { pcRef.current.close(); } catch {}
      pcRef.current = null;
    }
    pendingCandidates.current = [];
    remoteDescSet.current = false;
    setRemoteStream(null);
    setConnectionState('idle');
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
      };

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
    sendChat, sendProfile, sendReaction,
    toggleAudio, toggleVideo, audioEnabled, videoEnabled,
    startMedia, stopAll
  };
}
