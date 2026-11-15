import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { THRESHOLDS, SCORE, INDICATORS } from '../config/thresholds.js';
import { evaluateLog, dailyScoreSeries, weeklySummary, DAY_MS, missionDayOf } from '../lib/evaluate.js';
import { scoreBand } from '../lib/score.js';
import { radiationGreenLimit } from '../lib/severity.js';
import { formatDate, formatTime, SOURCE_LABEL } from '../lib/format.js';
import TrendChart from '../components/TrendChart.jsx';
import LogTable from '../components/LogTable.jsx';

const RANGES = [
  { id: '1w', label: 'Past week', days: 7 },
  { id: '2w', label: '2 weeks', days: 14 },
  { id: '4w', label: '4 weeks', days: 28 },
  { id: 'all', label: 'All', days: Infinity },
];

function twoSided(cfg, lo, hi) {
  return [
    { from: lo, to: cfg.amber[0], severity: 'red' },
    { from: cfg.amber[0], to: cfg.green[0], severity: 'amber' },
    { from: cfg.green[0], to: cfg.green[1], severity: 'green' },
    { from: cfg.green[1], to: cfg.amber[1], severity: 'amber' },
    { from: cfg.amber[1], to: hi, severity: 'red' },
  ];
}

function toCsv(logs, ctx) {
  const cols = ['date', 'time', 'mission_day', 'source', 'device', 'hr', 'sys', 'dia', 'glucose', 'temp', 'sleep', 'radiation_mGy_day', 'spe', 'environment', 'notes'];
  const esc = (v) => (v === undefined || v === null ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const rows = logs.map((l) =>
    [formatDate(l.ts), formatTime(l.ts), missionDayOf(l.ts, ctx.missionStart), l.source, l.device, l.hr, l.sys, l.dia, l.glucose, l.temp, l.sleep, l.radiation, l.spe ? 'yes' : '', l.environment, l.notes].map(esc).join(','),
  );
  return [cols.join(','), ...rows].join('\n');
}

/** Symptom notes the astronaut saved from Evexia AI, newest first. */
function SymptomNotes() {
  const notes = useHealthStore((s) => s.symptomNotes);
  const setNoteStatus = useHealthStore((s) => s.setSymptomNoteStatus);
  if (!notes.length) return null;
  return (
    <section className="hud-panel" aria-labelledby="notes-h" data-testid="symptom-notes">
      <h2 id="notes-h" className="text-lg font-bold">Symptom notes</h2>
      <p className="text-sm text-ink-3">Saved from Evexia AI after you confirmed them. Descriptions only, not diagnoses.</p>
      <ul className="mt-2 flex flex-col">
        {notes.map((n) => (
          <li key={n.id} className="flex flex-wrap items-start gap-x-4 gap-y-1 border-b border-line/60 py-2.5 text-sm last:border-0">
            <span className="num w-[132px] flex-none text-ink-3">{formatDate(n.ts)} {formatTime(n.ts)}</span>
            <span className="min-w-[220px] flex-1">
              <span className="block font-semibold">{n.summary}</span>
              {n.details && <span className="block whitespace-pre-wrap text-ink-2">{n.details}</span>}
              {n.recheckAt && (
                <span className="block text-xs text-ink-3">
                  {n.status === 'done' ? 'Rechecked' : `Recheck ${formatDate(n.recheckAt)} ${formatTime(n.recheckAt)}`}
                </span>
              )}
            </span>
            <button type="button" className="btn-ghost min-h-touch px-3 text-xs" onClick={() => setNoteStatus(n.id, n.status === 'done' ? 'open' : 'done')}>
              {n.status === 'done' ? 'Reopen' : 'Mark done'}
              <span className="sr-only">: {n.summary}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function History() {
  const crewLogs = useHealthStore((s) => s.crewLogs);
  const ctx = useHealthStore((s) => s.ctx);
  const environment = useHealthStore((s) => s.environment);
  const deleteLog = useHealthStore((s) => s.deleteLog);
  const showToast = useHealthStore((s) => s.showToast);
  const now = useHealthStore((s) => s.clock);
  const [range, setRange] = useState('2w');
  const [source, setSource] = useState('all');

  const r = RANGES.find((x) => x.id === range);
  const from = Number.isFinite(r.days) ? now - r.days * DAY_MS : crewLogs.length ? new Date(crewLogs[0].ts).getTime() : now - 7 * DAY_MS;
  const inRange = useMemo(() => crewLogs.filter((l) => new Date(l.ts).getTime() >= from && (source === 'all' || l.source === source)), [crewLogs, from, source]);

  const points = useMemo(
    () =>
      inRange.map((l) => {
        const res = evaluateLog(l, crewLogs, ctx);
        return { ...l, t: new Date(l.ts).getTime(), severities: Object.fromEntries(Object.entries(res).map(([k, v]) => [k, v.severity])) };
      }),
    [inRange, crewLogs, ctx],
  );
  const scores = useMemo(
    () => dailyScoreSeries(crewLogs, ctx, from, now).filter((d) => d.score != null).map((d) => ({ ...d, t: d.t + DAY_MS / 2, scoreSeverity: scoreBand(d.score).severity })),
    [crewLogs, ctx, from, now],
  );
  const weeks = useMemo(() => weeklySummary(inRange, ctx), [inRange, ctx]);
  const xDomain = [from, now];
  const radGreenMsv = radiationGreenLimit(environment);
  const sl = THRESHOLDS.sleep;

  const charts = [
    { id: 'hr', title: 'Resting heart rate', unit: 'bpm', sevKey: 'hr', lines: [{ key: 'hr', name: 'Heart rate', color: 'rgb(var(--c-ink))' }], domain: [30, 130], bands: twoSided(THRESHOLDS.hr, 30, 130) },
    { id: 'bp', title: 'Blood pressure', unit: 'mmHg', sevKey: 'bp', domain: [40, 180], lines: [{ key: 'sys', name: 'Systolic', color: 'rgb(var(--c-ink))' }, { key: 'dia', name: 'Diastolic', color: '#7dd3fc' }], bands: twoSided(THRESHOLDS.sys, 40, 180), refLines: [{ y: 85, label: 'dia amber 85' }, { y: 90, label: 'dia red 90' }] },
    { id: 'glucose', title: 'Fasting blood glucose', unit: 'mg/dL', sevKey: 'glucose', lines: [{ key: 'glucose', name: 'Glucose', color: 'rgb(var(--c-ink))' }], domain: [40, 160], bands: twoSided(THRESHOLDS.glucose, 40, 160) },
    { id: 'temp', title: 'Body temperature', unit: '°C', sevKey: 'temp', lines: [{ key: 'temp', name: 'Temperature', color: 'rgb(var(--c-ink))' }], domain: [34, 39.5], bands: twoSided(THRESHOLDS.temp, 34, 39.5) },
    { id: 'sleep', title: 'Sleep', unit: 'h', sevKey: 'sleep', lines: [{ key: 'sleep', name: 'Sleep', color: 'rgb(var(--c-ink))' }], domain: [3, 10], bands: [{ from: 3, to: sl.redSingleNight, severity: 'red' }, { from: sl.redSingleNight, to: sl.greenMin, severity: 'amber' }, { from: sl.greenMin, to: 10, severity: 'green' }], refLines: [{ y: sl.redConsecutiveBelow, label: '<6 h two nights = red' }] },
    { id: 'radiation', title: 'Dosimeter (absorbed dose)', unit: 'mGy/day', sevKey: 'radiation', lines: [{ key: 'radiation', name: 'Absorbed dose', color: 'rgb(var(--c-ink))' }], domain: [0, 'auto'], bands: [], note: `Limits are effective dose (mSv). In this environment green is below ${radGreenMsv} mSv/day; each point is coloured by its estimated mSv.` },
  ];

  const exportCsv = () => {
    const url = URL.createObjectURL(new Blob([toCsv(inRange, ctx)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `evexia-log-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">History</h1>
        <div role="group" aria-label="Time range" className="ml-auto flex overflow-hidden rounded-md border border-line">
          {RANGES.map((x) => (
            <button key={x.id} type="button" aria-pressed={range === x.id} onClick={() => setRange(x.id)} className={`min-h-touch px-4 font-semibold ${range === x.id ? 'bg-accent text-white' : 'bg-surface-2 hover:text-accent-text'}`} data-testid={`range-${x.id}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      <p className="text-sm text-ink-3">
        {formatDate(from)} – {formatDate(now)} · {inRange.length} log entries. Shaded zones are the green, amber and red bands; point shapes show each reading&apos;s status (circle green, triangle amber, square red).
      </p>

      {crewLogs.length === 0 ? (
        <section className="hud-panel" data-testid="history-empty">
          <p className="font-semibold">No history yet.</p>
          <p className="text-sm text-ink-3">
            <Link to="/log" className="text-accent-text underline">Log a reading</Link> or <Link to="/telemetry" className="text-accent-text underline">sync wearable telemetry</Link> to start your health history.
          </p>
        </section>
      ) : (
        <>
          <TrendChart id="score" title="Daily health score" unit="0–100" data={scores} xDomain={xDomain} lines={[{ key: 'score', name: 'Score', color: 'rgb(var(--c-ink))' }]} domain={[0, 100]} bands={[{ from: 0, to: 60, severity: 'red' }, { from: 60, to: SCORE.bands[0].min, severity: 'amber' }, { from: SCORE.bands[0].min, to: 100, severity: 'green' }]} note="Score at the end of each day, from the readings current at that time." />
          <div className="grid gap-4 lg:grid-cols-2">
            {charts.map((c) => (
              <TrendChart key={c.id} {...c} data={points} xDomain={xDomain} />
            ))}
          </div>

          <section className="hud-panel" aria-labelledby="weekly-h">
            <h2 id="weekly-h" className="text-lg font-bold">Weekly summary</h2>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm" data-testid="weekly-table">
                <caption className="sr-only">Averages and alert counts per week</caption>
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
                    <th scope="col" className="py-2">Week of</th>
                    <th scope="col">Logs</th>
                    <th scope="col">Avg HR (bpm)</th>
                    <th scope="col">Avg BP (mmHg)</th>
                    <th scope="col">Avg glucose</th>
                    <th scope="col">Avg temp (°C)</th>
                    <th scope="col">Avg sleep (h)</th>
                    <th scope="col">Avg dose (mGy/d)</th>
                    <th scope="col">Amber</th>
                    <th scope="col">Red</th>
                  </tr>
                </thead>
                <tbody>
                  {weeks.map((w) => (
                    <tr key={w.weekOf} className="num border-b border-line/60">
                      <th scope="row" className="py-2 font-semibold">{formatDate(w.weekOf)}</th>
                      <td>{w.logs}</td>
                      <td>{w.hr ?? '—'}</td>
                      <td>{w.sys != null ? `${w.sys}/${w.dia}` : '—'}</td>
                      <td>{w.glucose ?? '—'}</td>
                      <td>{w.temp ?? '—'}</td>
                      <td>{w.sleep ?? '—'}</td>
                      <td>{w.radiation ?? '—'}</td>
                      <td className={w.amber ? 'text-warn-fg' : ''}>{w.amber}</td>
                      <td className={w.red ? 'text-crit-fg' : ''}>{w.red}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      <SymptomNotes />

      <section className="hud-panel" aria-labelledby="log-h">
        <div className="flex flex-wrap items-center gap-3">
          <h2 id="log-h" className="text-lg font-bold">Log entries</h2>
          <label className="ml-auto flex items-center gap-2 text-sm">
            Source
            <select className="field w-auto py-1 font-sans text-base" value={source} onChange={(e) => setSource(e.target.value)} data-testid="source-filter">
              <option value="all">All</option>
              {Object.entries(SOURCE_LABEL).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </label>
          <button type="button" className="btn-ghost" onClick={exportCsv} disabled={!inRange.length}>Export CSV</button>
        </div>
        <LogTable
          logs={[...inRange].reverse()}
          onDelete={(l) => {
            if (window.confirm(`Delete the log entry from ${formatDate(l.ts)} ${formatTime(l.ts)}?`)) {
              deleteLog(l.id);
              showToast('Log entry deleted.', 'ok');
            }
          }}
        />
      </section>
      <p className="text-xs text-ink-3">Indicators tracked: {INDICATORS.map((m) => m.short).join(', ')}.</p>
    </div>
  );
}
