import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceArea, ReferenceLine, Tooltip } from 'recharts';
import { SEVERITY_META } from './Status.jsx';
import { formatDateTime } from '../lib/format.js';

const FILL = { green: '#22c55e', amber: '#f59e0b', red: '#ef4444' };

function SeverityDot({ cx, cy, payload, sevKey }) {
  const sev = sevKey ? payload.severities?.[sevKey] : payload.scoreSeverity;
  if (cx == null || cy == null || !sev) return null;
  if (sev === 'red') return <rect x={cx - 3.5} y={cy - 3.5} width={7} height={7} fill={FILL.red} />;
  if (sev === 'amber') return <polygon points={`${cx},${cy - 4} ${cx + 4},${cy + 3.5} ${cx - 4},${cy + 3.5}`} fill={FILL.amber} />;
  return <circle cx={cx} cy={cy} r={2.5} fill={FILL.green} />;
}

const dayTick = (t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });

/**
 * Time-series chart with green/amber/red bands. `data` rows carry `t` (ms).
 * @param {Array} props.bands  [{ from, to, severity }]
 * @param {Array} props.lines  [{ key, name, color }]
 */
export default function TrendChart({ id, title, unit, data, bands, lines, domain = ['auto', 'auto'], refLines = [], sevKey, xDomain, note }) {
  const pts = data.filter((d) => lines.some((l) => Number.isFinite(d[l.key])));
  const values = pts.flatMap((d) => lines.map((l) => d[l.key])).filter(Number.isFinite);
  const latest = pts[pts.length - 1];
  const summary = values.length
    ? `${title}: ${pts.length} readings. Latest ${lines.map((l) => `${l.name} ${latest?.[l.key]}`).join(', ')} ${unit}. Range ${Math.min(...values)} to ${Math.max(...values)}.`
    : `${title}: no readings in this period.`;
  const sev = sevKey ? latest?.severities?.[sevKey] : latest?.scoreSeverity;
  return (
    <section className="hud-panel" aria-labelledby={`trend-${id}-title`} data-testid={`trend-${id}`} data-bands={bands.length} data-points={pts.length}>
      <div className="flex items-center justify-between gap-2">
        <h2 id={`trend-${id}-title`} className="font-semibold">
          {title} <span className="text-sm font-normal text-ink-3">({unit})</span>
        </h2>
        {sev && <span className={`text-sm font-semibold ${SEVERITY_META[sev].text}`}>Latest: {SEVERITY_META[sev].label}</span>}
      </div>
      <p className="sr-only">{summary}</p>
      {pts.length === 0 ? (
        <p className="mt-6 text-sm text-ink-3">No readings in this period.</p>
      ) : (
        <div className="mt-2 h-[220px]" role="img" aria-label={summary}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={pts} margin={{ top: 8, right: 12, bottom: 0, left: -8 }}>
              {bands.map((b, i) => (
                <ReferenceArea key={i} y1={b.from} y2={b.to} fill={FILL[b.severity]} fillOpacity={0.12} stroke="none" ifOverflow="hidden" />
              ))}
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={xDomain ?? ['dataMin', 'dataMax']} tickFormatter={dayTick} tickCount={7} />
              <YAxis domain={domain} width={48} allowDataOverflow />
              {refLines.map((r) => (
                <ReferenceLine key={r.y + r.label} y={r.y} stroke="#94a3b8" strokeDasharray="4 4" label={{ value: r.label, position: 'insideTopRight', fill: '#94a3b8', fontSize: 11 }} />
              ))}
              <Tooltip
                contentStyle={{ background: 'rgb(12 22 44)', border: '1px solid rgb(40 64 110)', borderRadius: 6, color: '#e8eef8' }}
                labelFormatter={(t) => formatDateTime(t)}
                formatter={(v, name) => [`${v} ${unit}`, name]}
              />
              {lines.map((l) => (
                <Line
                  key={l.key}
                  type="monotone"
                  dataKey={l.key}
                  name={l.name}
                  stroke={l.color}
                  strokeWidth={2}
                  dot={({ key: _k, ...p }) => <SeverityDot key={`${l.key}-${p.index}`} {...p} sevKey={sevKey} />}
                  isAnimationActive={false}
                  connectNulls
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      {note && <p className="mt-1 text-xs text-ink-3">{note}</p>}
    </section>
  );
}
