interface Props { score: number; }

export function ChemistryMeter({ score }: Props) {
  const pct = Math.round(score);
  const hue = Math.round((pct / 100) * 130); // 0=red, 130=green-ish
  return (
    <div className="chemistry">
      <div className="chemistry-label">
        <span className="chemistry-emoji">💘</span>
        <span>Chemistry</span>
        <span className="chemistry-pct" style={{ color: `hsl(${hue}, 85%, 60%)` }}>{pct}%</span>
      </div>
      <div className="chemistry-bar">
        <div
          className="chemistry-fill"
          style={{
            width: `${pct}%`,
            background: `linear-gradient(90deg, hsl(${hue - 20}, 85%, 55%), hsl(${hue}, 90%, 65%))`
          }}
        />
      </div>
    </div>
  );
}
