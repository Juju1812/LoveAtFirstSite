interface Props {
  unlocked: boolean;
  swiped: 'left' | 'right' | null;
  peerLikedYou: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onNext: () => void;
}

export function Controls({
  unlocked, swiped, peerLikedYou,
  onSwipeLeft, onSwipeRight, onNext
}: Props) {
  const swipeDisabled = !unlocked || !!swiped;
  return (
    <div className="controls">
      <button
        className="ctrl ctrl-pass"
        onClick={onSwipeLeft}
        disabled={swipeDisabled}
        aria-label="Pass on this person"
        title={unlocked ? 'Pass — find someone new' : 'Locked until timer ends'}
      >
        <span className="ctrl-icon">✕</span>
        <span className="ctrl-label">Pass</span>
      </button>

      <button className="ctrl ctrl-next" onClick={onNext} title="Skip to next person">
        <span className="ctrl-icon">⏭</span>
        <span className="ctrl-label">Next</span>
      </button>

      <button
        className="ctrl ctrl-like"
        onClick={onSwipeRight}
        disabled={swipeDisabled}
        aria-label="Like this person"
        title={unlocked ? 'Like — both right = match' : 'Locked until timer ends'}
      >
        <span className="ctrl-icon">♥</span>
        <span className="ctrl-label">Like</span>
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
