import { useEffect, useRef } from 'react';

interface Props {
  localStream: MediaStream | null;
  remoteStream: MediaStream | null;
  connecting: boolean;
}

export function VideoStage({ localStream, remoteStream, connecting }: Props) {
  const remoteRef = useRef<HTMLVideoElement>(null);
  const localRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (remoteRef.current) remoteRef.current.srcObject = remoteStream;
  }, [remoteStream]);

  useEffect(() => {
    if (localRef.current) localRef.current.srcObject = localStream;
  }, [localStream]);

  const remoteHasVideo = !!remoteStream && remoteStream.getVideoTracks().length > 0;

  return (
    <div className="stage">
      <video ref={remoteRef} className="remote-video" autoPlay playsInline />
      {!remoteHasVideo && (
        <div className="connecting-overlay">
          <div className="pulse" />
          <p>{connecting ? 'Connecting to your match…' : 'Waiting for a partner…'}</p>
        </div>
      )}
      <div className="local-video-wrap">
        <video ref={localRef} className="local-video" autoPlay playsInline muted />
      </div>
    </div>
  );
}
