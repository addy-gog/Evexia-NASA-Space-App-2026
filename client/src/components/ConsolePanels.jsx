/**
 * Console building blocks from the light redesign (Handoff spec):
 * ReadingCard, HealthScoreRing, EarthLinkCard, HazardList, TrendPanel, GuidancePanel.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceArea, ReferenceDot, Tooltip } from 'recharts';
import { StatusBadge, StatusIcon, SEVERITY_META } from './Status.jsx';
import { INDICATORS, ENVIRONMENTS, THRESHOLDS, VALID_RANGES } from '../config/thresholds.js';
import { FIELD_BY_KEY, rangeText } from '../config/fields.js';
import { formatIndicatorValue, formatTime, relativeTime, formatDateTime } from '../lib/format.js';
import { formatDelay, selfCareFirst } from '../lib/comms.js';
import { SEVERITY_RANK, radiationGreenLimit } from '../lib/severity.js';
import { GUIDANCE } from '../content/guidance.js';
import { HAZARDS, HAZARD_IDS } from '../content/hazards.js';
import { DAY_MS } from '../lib/evaluate.js';

const fieldsOf = { hr: ['hr'], bp: ['sys', 'dia'], glucose: ['glucose'], temp: ['temp'], sleep: ['sleep'], radiation: ['radiation'] };

/* ---------- Reading card ---------- */
function SliderRow({ field, value, onChange, label }) {
  const f = FIELD_BY_KEY[field];
  const n = Number(value);
  const sliderVal = Number.isFinite(n) && value !== '' ? Math.min(f.slider[1], Math.max(f.slider[0], n)) : f.slider[0];
  return (
    <div className="flex items-center gap-2.5">
      {label && <span className="w-[62px] flex-none text-xs text-ink-3">{label}</span>}
      <label className="sr-only" htmlFor={`cs-${field}`}>{f.label} slider</label>
      <input id={`cs-${field}`} type="range" min={f.slider[0]} max={f.slider[1]} step={f.step} value={sliderVal} onChange={(e) => onChange(field, e.target.value)} aria-valuetext={`${value || 'empty'} ${f.unit}`} data-testid={`console-slider-${field}`} />
      <label className="sr-only" htmlFor={`cn-${field}`}>{f.label} value</label>
      <input
        id={`cn-${field}`}
        type="number"
        inputMode="decimal"
        min={VALID_RANGES[field].min}
        max={VALID_RANGES[field].max}
        step={f.step}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        className="h-11 w-[88px] flex-none rounded-[10px] border border-[#C9D1DC] bg-surface px-2.5 font-mono text-[15px] text-ink"
        data-testid={`console-input-${field}`}
      />
    </div>
  );
}

export function ReadingCard({ meta, result, snap, values, onChange, selected, onSelect, baselineMode, baseline, environment, now, edited }) {
  const sev = result?.severity;
  const reading = meta.id === 'bp' ? { sys: values.sys, dia: values.dia } : { [meta.id]: values[meta.id] };
  const display = values[fieldsOf[meta.id][0]] === '' ? '—' : formatIndicatorValue(meta.id, Object.fromEntries(Object.entries(reading).map(([k, v]) => [k, v === '' ? undefined : Number(v)])));
  let delta = '';
  if (baselineMode && baseline) {
    if (meta.id === 'bp' && values.sys !== '' && baseline.sys) {
      const d = Number(values.sys) - baseline.sys;
      delta = `${d >= 0 ? '+' : ''}${d} vs your pre-flight ${baseline.sys}/${baseline.dia}`;
    } else if (baseline[meta.id] != null && values[meta.id] !== '' && meta.id !== 'radiation') {
      const d = Math.round((Number(values[meta.id]) - baseline[meta.id]) * 10) / 10;
      delta = `${d >= 0 ? '+' : ''}${d} vs your pre-flight ${baseline[meta.id]}`;
    }
  }
  return (
    <div
      className={`flex flex-col gap-2 rounded-tile border px-3.5 py-3 transition-[border-color,box-shadow] hover:border-[#B8C2D3] ${selected ? 'border-accent bg-[#F7F9FF] shadow-sel hover:border-accent' : 'border-line bg-surface'}`}
      data-testid={`card-${meta.id}`}
      data-severity={sev ?? (snap?.stale ? 'stale' : 'none')}
    >
      <div className="flex items-center gap-2.5">
        <button type="button" onClick={() => onSelect(meta.id)} aria-pressed={selected} className="flex min-h-touch min-w-0 flex-1 flex-col justify-center text-left">
          <span className="text-[13px] font-semibold text-ink-3">{meta.label}</span>
          <span className="font-mono text-[22px] font-semibold tracking-tight">
            <span data-testid={`value-${meta.id}`}>{display}</span> <span className="text-xs font-medium text-[#5B6575]">{meta.unit}</span>
          </span>
        </button>
        {sev ? <StatusBadge severity={sev} compact /> : <span className="text-xs text-ink-3">{snap?.stale ? 'Out of date' : 'No data'}</span>}
      </div>
      <SliderRow field={fieldsOf[meta.id][0]} value={values[fieldsOf[meta.id][0]]} onChange={onChange} label={meta.id === 'bp' ? 'Systolic' : null} />
      {meta.id === 'bp' && <SliderRow field="dia" value={values.dia} onChange={onChange} label="Diastolic" />}
      <div className="flex flex-wrap justify-between gap-2 text-xs text-[#5B6575]">
        <span>{rangeText(meta.id, environment)}</span>
        {delta && <span className="font-mono text-ink-2" data-testid={`delta-${meta.id}`}>{delta}</span>}
      </div>
      {snap && !edited && (
        <p className="text-xs text-ink-3" data-testid={`measured-${meta.id}`}>
          Measured {formatTime(snap.ts)} ({relativeTime(snap.ts, now)}) · {snap.source === 'manual' ? 'manual' : snap.device || snap.source}
          {snap.stale ? ' · out of date, not counted' : ''}
        </p>
      )}
      {edited && <p className="text-xs font-semibold text-accent">Edited · not saved yet</p>}
      {result?.spe && <p className="text-xs font-semibold text-crit-fg">Solar particle event alert</p>}
    </div>
  );
}

/* ---------- Health score ring ---------- */
export function HealthScoreRing({ score, counts }) {
  const value = score?.score;
  const band = score?.band;
  const sev = band?.severity ?? 'green';
  const m = SEVERITY_META[sev];
  const C = 2 * Math.PI * 54;
  return (
    <section className="hud-panel flex flex-col gap-3.5" aria-labelledby="h-score" data-testid="score-gauge" data-score={value ?? ''} data-band={band?.label ?? ''}>
      <h2 id="h-score" className="hud-title">Health score</h2>
      {value == null ? (
        <p className="text-sm text-ink-3">No current readings yet. Log readings or sync a wearable.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-4">
          <div className="relative h-[132px] w-[132px] flex-none">
            <svg width="132" height="132" viewBox="0 0 132 132" role="img" aria-label={`Health score ${value} of 100, ${band.label}`}>
              <circle cx="66" cy="66" r="54" fill="none" stroke="#EEF1F5" strokeWidth="12" />
              <circle cx="66" cy="66" r="54" fill="none" stroke={m.color} strokeWidth="12" strokeLinecap="round" strokeDasharray={`${((value / 100) * C).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 66 66)" style={{ transition: 'stroke-dasharray .5s ease-out' }} />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className="font-mono text-[34px] font-semibold tracking-tighter">{value}</span>
              <span className="text-[11px] text-ink-3">of 100</span>
            </div>
          </div>
          <div className="flex min-w-0 flex-col gap-2">
            <span className="flex items-center gap-2 font-display text-xl font-bold" style={{ color: m.fg }}>
              <StatusIcon severity={sev} size={18} />
              <span data-testid="score-band">{band.label}</span>
            </span>
            <span className="text-[13px] text-ink-2">{counts[0]} nominal · {counts[1]} caution · {counts[2]} critical</span>
            {score.capped && <span className="text-xs text-ink-3">Capped at 59 because a reading is critical.</span>}
          </div>
        </div>
      )}
      <p className="sr-only" role="status">{value == null ? 'No health score yet.' : `Health score ${value} of 100: ${band.label}.`}</p>
    </section>
  );
}

/* ---------- Earth link ---------- */
export function EarthLinkCard({ environment, delaySeconds, anyCritical, onSend, sentInfo }) {
  const env = ENVIRONMENTS[environment];
  const auto = selfCareFirst(delaySeconds);
  const greenMgy = (env.radiationGreenBelowMsv / env.qualityFactor).toFixed(2);
  return (
    <section className="hud-panel flex flex-col gap-3" aria-labelledby="h-comms" data-testid="earth-link-card">
      <div className="flex items-center justify-between gap-2">
        <h2 id="h-comms" className="hud-title">Earth link</h2>
        <span className="rounded-full px-2.5 py-1 text-xs font-bold" style={auto ? { background: '#FFF1D6', color: '#8A4B00' } : { background: '#E8EEFC', color: '#163BA6' }} data-testid="link-mode">
          {auto ? 'Autonomy mode' : 'Ground-linked'}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2.5">
        <div className="tile">
          <div className="text-xs text-ink-3">One-way delay</div>
          <div className="font-mono text-lg font-semibold">{delaySeconds > 0 ? `≈${formatDelay(delaySeconds)}` : 'real-time'}</div>
        </div>
        <div className="tile">
          <div className="text-xs text-ink-3">Radiation nominal</div>
          <div className="font-mono text-lg font-semibold">&lt;{greenMgy}<span className="text-xs font-medium text-ink-3"> mGy/d</span></div>
        </div>
      </div>
      <p className="text-sm text-ink-2">
        {auto
          ? `Messages take about ${formatDelay(delaySeconds)} each way. Start the self-care steps first, re-measure, then escalate if nothing improves.`
          : 'The flight surgeon is reachable in near real time. Escalate early on any critical reading.'}
      </p>
      {sentInfo ? (
        <p role="status" className="rounded-tile bg-ok-bg px-3 py-2.5 text-sm font-semibold text-ok-fg" data-testid="report-sent">
          Report sent {formatTime(sentInfo.at)}. {auto ? `It will arrive in about ${formatDelay(delaySeconds)}.` : 'The flight surgeon has it now.'}
        </p>
      ) : (
        <button type="button" className="btn-primary w-full" onClick={onSend} data-testid="send-report-card">
          {anyCritical ? 'Escalate now' : 'Send report to flight surgeon'}
        </button>
      )}
    </section>
  );
}

/* ---------- NASA HRP hazards ---------- */
export function HazardList({ results, hazards, delaySeconds }) {
  const auto = selfCareFirst(delaySeconds);
  const rows = HAZARD_IDS.map((hid) => {
    if (hid === 'distance') return { id: hid, sev: auto ? 'amber' : 'green', text: auto ? 'Autonomy mode' : 'Ground-linked' };
    const linked = INDICATORS.filter((m) => GUIDANCE[m.id].hazard === hid && results[m.id]);
    let worst = 'green';
    let n = 0;
    for (const m of linked) {
      const s = results[m.id].severity;
      if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
      if (s !== 'green') n += 1;
    }
    for (const h of hazards.filter((x) => x.hazard === hid)) if (SEVERITY_RANK[h.severity] > SEVERITY_RANK[worst]) worst = h.severity;
    const insights = hazards.filter((x) => x.hazard === hid).length;
    const flags = n + insights;
    return { id: hid, sev: worst, text: flags ? `${flags} flag${flags > 1 ? 's' : ''}` : 'No flags' };
  });
  return (
    <section className="hud-panel flex flex-col gap-2.5" aria-labelledby="h-hazards" data-testid="hazard-list">
      <h2 id="h-hazards" className="hud-title">NASA HRP hazards</h2>
      <ul className="flex flex-col">
        {rows.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 border-b border-surface-2 py-2 last:border-0" data-testid={`hrp-${r.id}`} data-severity={r.sev}>
            <span className="flex items-center gap-2.5 text-sm font-semibold">
              <span className="block h-2.5 w-2.5 rounded-full" style={{ background: SEVERITY_META[r.sev].color }} aria-hidden="true" />
              {HAZARDS[r.id].label}
            </span>
            <span className="text-xs font-semibold" style={{ color: r.sev === 'green' ? '#4A5568' : SEVERITY_META[r.sev].fg }}>{r.text}</span>
          </li>
        ))}
      </ul>
      {hazards.slice(0, 2).map((h) => (
        <p key={h.id} className="rounded-tile px-3 py-2 text-xs font-semibold" style={{ background: SEVERITY_META[h.severity].bg, color: SEVERITY_META[h.severity].fg }} data-testid={`hazard-${h.id}`}>
          {h.title}
        </p>
      ))}
    </section>
  );
}

/* ---------- 14-day trend ---------- */
function bandsFor(id, environment) {
  const t = THRESHOLDS;
  if (id === 'sleep') return { green: [t.sleep.greenMin, 10], amber: [t.sleep.amberMin, t.sleep.greenMin], domain: [3, 10], key: 'sleep' };
  if (id === 'radiation') {
    const env = ENVIRONMENTS[environment] ?? ENVIRONMENTS.station;
    const g = radiationGreenLimit(environment) / env.qualityFactor;
    const a = t.radiation.redAboveMsv / env.qualityFactor;
    return { green: [0, g], amber: [g, a], domain: [0, 'auto'], key: 'radiation' };
  }
  const cfg = id === 'bp' ? t.sys : t[id];
  const pad = { hr: [30, 130], bp: [60, 180], glucose: [40, 160], temp: [34.5, 39.5] }[id];
  return { green: cfg.green, amber: cfg.amber, domain: pad, key: id === 'bp' ? 'sys' : id };
}

export function TrendPanel({ logs, environment, now, metric, onMetric, title = '14-day trend' }) {
  const b = bandsFor(metric, environment);
  const meta = INDICATORS.find((m) => m.id === metric);
  const from = now - 13 * DAY_MS;
  const data = useMemo(
    () => logs.filter((l) => Number.isFinite(l[b.key]) && new Date(l.ts).getTime() >= from - DAY_MS / 2).map((l) => ({ t: new Date(l.ts).getTime(), v: l[b.key], dia: l.dia })),
    [logs, b.key, from],
  );
  const last = data[data.length - 1];
  const aria = last ? `${meta.label} over the last 14 days, ${data.length} readings, latest ${last.v} ${meta.unit} on ${formatDateTime(last.t)}` : `${meta.label}: no readings in the last 14 days`;
  return (
    <section className="hud-panel flex flex-col gap-3" aria-labelledby="h-trend" data-testid="trend-panel" data-metric={metric} data-points={data.length}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="h-trend" className="hud-title">{title}</h2>
        <div role="group" aria-label="Trend metric" className="flex flex-wrap gap-1.5">
          {INDICATORS.map((m) => (
            <button
              key={m.id}
              type="button"
              aria-pressed={metric === m.id}
              onClick={() => onMetric(m.id)}
              className={`min-h-touch rounded-[10px] border px-3 text-[13px] font-semibold ${metric === m.id ? 'border-accent bg-accent text-white' : 'border-line bg-surface text-ink-2 hover:bg-surface-2'}`}
              data-testid={`trend-tab-${m.id}`}
            >
              {m.short}
            </button>
          ))}
        </div>
      </div>
      {data.length === 0 ? (
        <p className="py-12 text-center text-sm text-ink-3">No {meta.short.toLowerCase()} readings in the last 14 days.</p>
      ) : (
        <div className="h-[220px]" role="img" aria-label={aria}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 14, bottom: 0, left: -10 }}>
              <ReferenceArea y1={b.amber[0]} y2={b.amber[1]} fill="#FFF1D6" fillOpacity={0.9} stroke="none" ifOverflow="hidden" />
              <ReferenceArea y1={b.green[0]} y2={b.green[1]} fill="#E2F4EA" fillOpacity={1} stroke="none" ifOverflow="hidden" />
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="t" type="number" scale="time" domain={[from, now]} tickFormatter={(t) => new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })} tickCount={6} />
              <YAxis domain={b.domain} width={46} allowDataOverflow />
              <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #DDE2E9' }} labelFormatter={(t) => formatDateTime(t)} formatter={(v) => [`${v} ${meta.unit}`, meta.short]} />
              <Line type="monotone" dataKey="v" stroke="#1F4FD8" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              {last && <ReferenceDot x={last.t} y={last.v} r={6} fill="#1F4FD8" stroke="#FFFFFF" strokeWidth={3} />}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="flex flex-wrap gap-3 text-xs text-ink-3">
        <span className="flex items-center gap-1.5"><span className="block h-3 w-3 rounded-sm bg-ok-bg ring-1 ring-ok-line" aria-hidden="true" />Nominal band</span>
        <span className="flex items-center gap-1.5"><span className="block h-3 w-3 rounded-sm bg-warn-bg ring-1 ring-warn-line" aria-hidden="true" />Caution band</span>
        <Link to="/history" className="ml-auto font-semibold text-accent underline-offset-2 hover:underline">Full history</Link>
      </p>
    </section>
  );
}

/* ---------- What to do next ---------- */
export function GuidancePanel({ results, reading, onSelect }) {
  const items = INDICATORS.filter((m) => results[m.id] && results[m.id].severity !== 'green').sort(
    (a, b) => SEVERITY_RANK[results[b.id].severity] - SEVERITY_RANK[results[a.id].severity] || b.weight - a.weight,
  );
  const any = INDICATORS.some((m) => results[m.id]);
  return (
    <section className="hud-panel flex flex-col gap-3" aria-labelledby="h-next" data-testid="guidance-panel">
      <h2 id="h-next" className="hud-title">What to do next</h2>
      {!any ? (
        <p className="text-sm text-ink-3">Log your readings to get personalised next steps.</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 rounded-tile bg-ok-bg p-4 text-ok-fg" data-testid="all-nominal">
          <StatusIcon severity="green" size={22} />
          <span className="font-semibold">All current readings are nominal.</span>
        </div>
      ) : (
        <ul className="flex flex-col gap-2.5" data-testid="latest-alerts-list">
          {items.map((m) => {
            const r = results[m.id];
            const g = GUIDANCE[m.id][r.severity];
            const sm = SEVERITY_META[r.severity];
            return (
              <li key={m.id} className="rounded-tile p-3.5" style={{ background: sm.bg }} data-testid={`alert-${m.id}`} data-severity={r.severity}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <button type="button" onClick={() => onSelect?.(m.id)} className="min-h-touch text-left font-bold" style={{ color: sm.fg }}>
                    {m.short} · <span className="num">{formatIndicatorValue(m.id, reading)} {m.unit}</span>
                  </button>
                  <StatusBadge severity={r.severity} compact className="bg-surface" />
                </div>
                <p className="mt-1 text-sm text-ink">{g.meaning} <strong>{g.selfCare[0]}</strong></p>
                <p className="mt-1 text-xs text-ink-3">Hazard: {HAZARDS[GUIDANCE[m.id].hazard].label}</p>
              </li>
            );
          })}
        </ul>
      )}
      {items.length > 0 && <Link to="/alerts" className="btn-ghost w-full text-sm">Full guidance and escalation</Link>}
    </section>
  );
}

/* ---------- Environment segmented control + baseline switch ---------- */
export function EnvironmentSegmented({ value, onChange }) {
  return (
    <div role="group" aria-label="Environment" className="flex max-w-full gap-1 overflow-x-auto rounded-tile border border-line bg-surface p-1 sm:flex-wrap">
      {Object.values(ENVIRONMENTS).map((e) => (
        <button
          key={e.id}
          type="button"
          aria-pressed={value === e.id}
          onClick={() => onChange(e.id)}
          className={`min-h-touch flex-none whitespace-nowrap rounded-[10px] px-3 text-[13px] font-semibold ${value === e.id ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}
          data-testid={`envseg-${e.id}`}
        >
          {e.label.replace(' (LEO)', '').replace(' / surface', '').replace(' (surface traverse)', '')}
        </button>
      ))}
    </div>
  );
}

export function BaselineSwitch({ on, onToggle }) {
  return (
    <button type="button" aria-pressed={on} onClick={onToggle} className="flex min-h-[48px] items-center gap-2.5 rounded-tile border border-line bg-surface py-1.5 pl-2 pr-3.5 font-semibold text-ink" data-testid="baseline-switch">
      <span className={`relative block h-6 w-10 rounded-full transition-colors ${on ? 'bg-accent' : 'bg-[#C9D1DC]'}`} aria-hidden="true">
        <span className={`absolute top-[3px] block h-[18px] w-[18px] rounded-full bg-white shadow transition-all ${on ? 'left-[19px]' : 'left-[3px]'}`} />
      </span>
      Personal baseline
    </button>
  );
}

export function useConsoleSelection(initial = 'sleep') {
  const [selected, setSelected] = useState(initial);
  const [metric, setMetric] = useState(initial);
  const select = (id) => {
    setSelected(id);
    setMetric(id);
  };
  return { selected, metric, select, setMetric };
}
