import { useMemo } from 'react';

const COLORS = ['#ff4d8b', '#ffb347', '#7afcff', '#b388ff', '#ffd166', '#ff85a1'];

export function Confetti({ count = 80 }: { count?: number }) {
  const pieces = useMemo(() =>
    Array.from({ length: count }, (_, i) => ({
      key: i,
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2 + Math.random() * 2.5,
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: 6 + Math.random() * 8,
      rotate: Math.random() * 360
    })), [count]);

  return (
    <div className="confetti-layer" aria-hidden>
      {pieces.map(p => (
        <span
          key={p.key}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            background: p.color,
            width: p.size,
            height: p.size * 0.4,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`
          }}
        />
      ))}
    </div>
  );
}
