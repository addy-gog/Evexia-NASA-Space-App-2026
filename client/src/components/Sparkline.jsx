/** Tiny dependency-free SVG sparkline with severity-coloured last point. */
export default function Sparkline({ values = [], color = '#38bdf8', lastColor, width = 120, height = 32 }) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length < 2) return <div style={{ width, height }} aria-hidden="true" />;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const step = width / (pts.length - 1);
  const coords = pts.map((v, i) => [i * step, height - 4 - ((v - min) / span) * (height - 8)]);
  const d = coords.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const [lx, ly] = coords[coords.length - 1];
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="overflow-visible">
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinejoin="round" opacity="0.8" />
      <circle cx={lx} cy={ly} r="3.5" fill={lastColor || color} />
    </svg>
  );
}
