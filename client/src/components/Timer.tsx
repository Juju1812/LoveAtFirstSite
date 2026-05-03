interface Props { secondsLeft: number; }

function format(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

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
      <span className="timer-value">{format(secondsLeft)}</span>
    </div>
  );
}
