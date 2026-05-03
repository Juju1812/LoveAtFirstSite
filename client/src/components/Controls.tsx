interface Props {
  unlocked: boolean;
  swiped: 'left' | 'right' | null;
  peerLikedYou: boolean;
  onPass: () => void;
  onLike: () => void;
}

export function Controls({
  unlocked, swiped, peerLikedYou,
  onPass, onLike
}: Props) {
  const passDisabled = !!swiped;
  const likeDisabled = !unlocked || !!swiped;
  return (
    <div className="controls">
      <button
        className="ctrl ctrl-pass"
        onClick={onPass}
        disabled={passDisabled}
        aria-label="Pass on this person"
        title={unlocked ? 'Pass — find someone new' : 'Skip — find someone else now'}
      >
        <span className="ctrl-icon">✕</span>
        <span className="ctrl-label">{unlocked ? 'Pass' : 'Skip'}</span>
      </button>

      <button
        className="ctrl ctrl-like"
        onClick={onLike}
        disabled={likeDisabled}
        aria-label="Like this person"
        title={unlocked ? 'Like — both right = match' : "Like unlocks once you've spent 2 minutes together"}
      >
        <span className="ctrl-icon">{unlocked ? '♥' : '🔒'}</span>
        <span className="ctrl-label">{unlocked ? 'Like' : 'Locked'}</span>
      </button>

      {peerLikedYou && unlocked && !swiped && (
        <div className="hint-bubble">They liked you 👀</div>
      )}
      {swiped === 'right' && (
        <div className="hint-bubble waiting">You liked them — waiting…</div>
      )}
    </div>
  );
}
