import type { ChemistryPoint } from '../callStats';

interface Props {
  history: ChemistryPoint[];
  width?: number;
  height?: number;
}

export function ChemistryChart({ history, width = 320, height = 88 }: Props) {
  if (history.length < 2) {
    return (
      <div className="chemistry-chart-empty" style={{ width, height }}>
        Not enough data
      </div>
    );
  }

  const t0 = history[0].t;
  const tEnd = history[history.length - 1].t;
  const range = Math.max(1, tEnd - t0);

  const points = history.map(p => {
    const x = ((p.t - t0) / range) * width;
    const y = height - (p.score / 100) * height;
    return [x, y];
  });

  // Smooth path with quadratic curves
  const pathD = points.reduce((d, [x, y], i) => {
    if (i === 0) return `M ${x.toFixed(1)} ${y.toFixed(1)}`;
    const [px, py] = points[i - 1];
    const cx = (px + x) / 2;
    return `${d} Q ${cx.toFixed(1)} ${py.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }, '');

  // Fill polygon
  const fillD = `${pathD} L ${width} ${height} L 0 ${height} Z`;

  const peakIdx = history.reduce((maxI, p, i) => (p.score > history[maxI].score ? i : maxI), 0);
  const peakPt = points[peakIdx];

  return (
    <svg
      className="chemistry-chart"
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="chemFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ff4d8b" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#ff4d8b" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="chemLine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ff2e63" />
          <stop offset="100%" stopColor="#ff85a1" />
        </linearGradient>
      </defs>
      {/* 50% baseline */}
      <line x1="0" y1={height / 2} x2={width} y2={height / 2}
            stroke="rgba(255,255,255,0.07)" strokeDasharray="3 4" />
      <path d={fillD} fill="url(#chemFill)" />
      <path d={pathD} stroke="url(#chemLine)" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      {/* Peak marker */}
      <circle cx={peakPt[0]} cy={peakPt[1]} r="4" fill="#ff4d8b" stroke="#fff" strokeWidth="1.5" />
    </svg>
  );
}
