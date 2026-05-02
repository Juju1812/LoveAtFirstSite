interface Props {
  unlocked: boolean;
  swiped: 'left' | 'right' | null;
  peerLikedYou: boolean;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  onNext: () => void;
  onReport: () => void;
}

export function Controls({
  unlocked, swiped, peerLikedYou,
  onSwipeLeft, onSwipeRight, onNext, onReport
}: Props) {
  return (
    <div className="controls">
      <button className="ctrl ctrl-secondary" onClick={onReport} title="Report user">
        🚩
      </button>

      <button
        className="ctrl ctrl-nope"
        onClick={onSwipeLeft}
        disabled={!unlocked || !!swiped}
        aria-label="Swipe left"
      >
        ✕
      </button>

      <button className="ctrl ctrl-next" onClick={onNext} title="Next person">
        Next ⏭
      </button>

      <button
        className="ctrl ctrl-like"
        onClick={onSwipeRight}
        disabled={!unlocked || !!swiped}
        aria-label="Swipe right"
      >
        ♥
      </button>

      {peerLikedYou && unlocked && !swiped && (
        <div className="hint-bubble">They swiped right on you 👀</div>
      )}
      {swiped === 'right' && (
        <div className="hint-bubble waiting">You liked them — waiting…</div>
      )}
    </div>
  );
}
