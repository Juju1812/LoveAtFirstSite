interface Props {
  passUnlocked: boolean;
  likeUnlocked: boolean;
  likeUnlockInSeconds: number;
  swiped: 'left' | 'right' | null;
  peerLikedYou: boolean;
  audioEnabled: boolean;
  videoEnabled: boolean;
  onPass: () => void;
  onLike: () => void;
  onToggleAudio: () => void;
  onToggleVideo: () => void;
}

export function Controls({
  passUnlocked, likeUnlocked, likeUnlockInSeconds,
  swiped, peerLikedYou,
  audioEnabled, videoEnabled,
  onPass, onLike, onToggleAudio, onToggleVideo
}: Props) {
  const passDisabled = !!swiped;
  const likeDisabled = !likeUnlocked || !!swiped;
  return (
    <div className="controls">
      <button
        className={`ctrl-toggle ${audioEnabled ? '' : 'ctrl-toggle-off'}`}
        onClick={onToggleAudio}
        title={audioEnabled ? 'Mute mic' : 'Unmute mic'}
        aria-label={audioEnabled ? 'Mute microphone' : 'Unmute microphone'}
      >
        {audioEnabled ? '🎤' : '🔇'}
      </button>

      <button
        className="ctrl ctrl-pass"
        onClick={onPass}
        disabled={passDisabled}
        aria-label="Pass on this person"
        title={passUnlocked ? 'Pass — find someone new' : 'Skip — find someone else now'}
      >
        <span className="ctrl-icon">✕</span>
        <span className="ctrl-label">{passUnlocked ? 'Pass' : 'Skip'}</span>
      </button>

      <button
        className="ctrl ctrl-like"
        onClick={onLike}
        disabled={likeDisabled}
        aria-label="Like this person"
        title={likeUnlocked
          ? 'Like — both right = match'
          : `Like unlocks in ${likeUnlockInSeconds}s`}
      >
        {likeUnlocked ? (
          <>
            <span className="ctrl-icon">♥</span>
            <span className="ctrl-label">Like</span>
          </>
        ) : (
          <>
            <span className="ctrl-icon">🔒</span>
            <span className="ctrl-label">{likeUnlockInSeconds}s</span>
          </>
        )}
      </button>

      <button
        className={`ctrl-toggle ${videoEnabled ? '' : 'ctrl-toggle-off'}`}
        onClick={onToggleVideo}
        title={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
        aria-label={videoEnabled ? 'Turn camera off' : 'Turn camera on'}
      >
        {videoEnabled ? '📷' : '📵'}
      </button>

      {peerLikedYou && likeUnlocked && !swiped && (
        <div className="hint-bubble">They liked you 👀</div>
      )}
      {swiped === 'right' && (
        <div className="hint-bubble waiting">You liked them — waiting…</div>
      )}
    </div>
  );
}
