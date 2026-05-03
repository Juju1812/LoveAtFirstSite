interface Props {
  passUnlocked: boolean;       // true once Pass becomes "Pass" (after timer ends)
  likeUnlocked: boolean;       // true once Like becomes clickable (30s in)
  likeUnlockInSeconds: number; // countdown until Like unlocks (0 = unlocked)
  swiped: 'left' | 'right' | null;
  peerLikedYou: boolean;
  onPass: () => void;
  onLike: () => void;
}

export function Controls({
  passUnlocked, likeUnlocked, likeUnlockInSeconds,
  swiped, peerLikedYou,
  onPass, onLike
}: Props) {
  const passDisabled = !!swiped;
  const likeDisabled = !likeUnlocked || !!swiped;
  return (
    <div className="controls">
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
          : `Like unlocks in ${likeUnlockInSeconds}s — give it a moment`}
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

      {peerLikedYou && likeUnlocked && !swiped && (
        <div className="hint-bubble">They liked you 👀</div>
      )}
      {swiped === 'right' && (
        <div className="hint-bubble waiting">You liked them — waiting…</div>
      )}
    </div>
  );
}
