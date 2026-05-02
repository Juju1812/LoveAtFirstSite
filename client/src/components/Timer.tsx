interface Props { secondsLeft: number; }

export function Timer({ secondsLeft }: Props) {
  if (secondsLeft <= 0) {
    return (
      <div className="timer timer-unlocked">
        <span>🔥 Make your move</span>
      </div>
    );
  }
  return (
    <div className="timer">
      <span className="timer-label">Get to know each other</span>
      <span className="timer-value">{secondsLeft}s</span>
    </div>
  );
}
