import { useEffect, useRef, useState } from 'react';

interface Props { score: number; }

/**
 * Visually smooths the chemistry score. The `score` prop is the truthful,
 * up-to-date value (driven by speech / chat / face signals). Internally we
 * tween the *displayed* number and bar width toward it via RAF + a
 * critically-damped spring, so the meter feels like a living gauge instead
 * of snapping every time a new signal lands.
 *
 * Importantly this is display-only — chemistry stats / history / peer
 * broadcast are unaffected.
 */
export function ChemistryMeter({ score }: Props) {
  const [display, setDisplay] = useState(score);
  const targetRef = useRef(score);
  const valueRef = useRef(score);
  const velocityRef = useRef(0);
  const lastTsRef = useRef<number | null>(null);

  useEffect(() => { targetRef.current = score; }, [score]);

  useEffect(() => {
    let raf = 0;
    // Critically-damped spring tuning. Higher stiffness = faster catch-up;
    // damping=2*sqrt(stiffness) gives no overshoot. With these values the
    // bar settles in roughly 600-800ms after a step, with no oscillation.
    const stiffness = 35;
    const damping = 2 * Math.sqrt(stiffness);

    const tick = (ts: number) => {
      if (lastTsRef.current == null) lastTsRef.current = ts;
      const dt = Math.min(0.05, (ts - lastTsRef.current) / 1000);
      lastTsRef.current = ts;

      const x = valueRef.current;
      const v = velocityRef.current;
      const target = targetRef.current;

      const force = stiffness * (target - x) - damping * v;
      const newV = v + force * dt;
      const newX = x + newV * dt;

      velocityRef.current = newV;
      valueRef.current = newX;

      // Re-render only when the displayed integer changes — keeps text from
      // flickering at sub-pixel granularity.
      const rounded = Math.round(newX);
      setDisplay(prev => (prev !== rounded ? rounded : prev));

      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      lastTsRef.current = null;
    };
  }, []);

  const pct = Math.max(0, Math.min(100, display));
  // Use the smoothed value (not the raw int) for sub-pixel bar width so
  // the fill glides instead of stepping pixel-by-pixel.
  const smoothedPct = Math.max(0, Math.min(100, valueRef.current));
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
            width: `${smoothedPct}%`,
            background: `linear-gradient(90deg, hsl(${hue - 20}, 85%, 55%), hsl(${hue}, 90%, 65%))`
          }}
        />
      </div>
    </div>
  );
}
