import { useEffect, useRef } from 'react';
import { useAudioLevel } from '../useAudioLevel';

interface Props {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connecting: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  onLocalVideoEl?: (el: HTMLVideoElement | null) => void;
}

export function VideoStage({
  localStream, remoteStream, connecting,
  audioEnabled, videoEnabled,
  onLocalVideoEl
}: Props) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
    onLocalVideoEl?.(localRef.current);
    return () => onLocalVideoEl?.(null);
  }, [localStream, onLocalVideoEl]);

  const remoteLevel = useAudioLevel(remoteStream);
  const localLevel = useAudioLevel(localStream);
  const remoteSpeaking = remoteLevel > 0.18;
  const localSpeaking = localLevel > 0.18 && audioEnabled;

  const remoteHasVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div className="stage">
      <div className={`remote-frame ${remoteSpeaking ? 'is-speaking' : ''}`}>
        <video ref={remoteRef} className="remote-video" autoPlay playsInline />
        {!remoteHasVideo && (
          <div className="connecting-overlay">
            <div className="pulse" />
            <p>{connecting ? 'Connecting to your match…' : 'Waiting for a partner…'}</p>
          </div>
        )}
        <div className="stage-vignette" aria-hidden />
      </div>

      <div
        className={`local-pip ${localSpeaking ? 'is-speaking' : ''} ${!videoEnabled ? 'is-camera-off' : ''}`}
      >
        <video ref={localRef} className="local-video" autoPlay playsInline muted />
        {!videoEnabled && (
          <div className="local-pip-camoff">
            <span>📷</span>
            <span className="local-pip-camoff-label">Camera off</span>
          </div>
        )}
        {!audioEnabled && (
          <div className="local-pip-muted" title="Mic muted">🔇</div>
        )}
      </div>
    </div>
  );
}
