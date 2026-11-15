import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useHealthStore } from '../../store/useHealthStore.js';
import { api } from '../../lib/api.js';
import { INDICATORS, ENVIRONMENTS } from '../../config/thresholds.js';
import { sortLogs, dayKey, DAY_MS } from '../../lib/evaluate.js';
import { classifyHeartRate, worstOf } from '../../lib/severity.js';
import { formatDate, formatTime, relativeTime, formatDose, SOURCE_LABEL } from '../../lib/format.js';
import { StatusBadge, StatusIcon, SEVERITY_META } from '../../components/Status.jsx';
import LogTable from '../../components/LogTable.jsx';
import EscalationItem from '../../components/EscalationItem.jsx';
import { TrendPanel } from '../../components/ConsolePanels.jsx';

const TABS = ['Vitals', 'Logs', 'Escalations', 'Devices'];
const fmt = (id, v) => (v == null ? '—' : id === 'temp' || id === 'sleep' ? Number(v).toFixed(1) : id === 'radiation' ? formatDose(v) : v);

/** Dot-matrix heart rate: one column per day, one dot per 5 bpm above 40, coloured by status. */
function HeartDotMatrix({ logs, now }) {
  const days = [];
  for (let i = 13; i >= 0; i -= 1) {
    const t = now - i * DAY_MS;
    const k = dayKey(t);
    const vals = logs.filter((l) => Number.isFinite(l.hr) && dayKey(l.ts) === k).map((l) => l.hr);
    days.push({ k, t, avg: vals.length ? Math.round(vals.reduce((s, x) => s + x, 0) / vals.length) : null });
  }
  const known = days.filter((d) => d.avg != null);
  const thisWeek = known.filter((d) => d.t > now - 7 * DAY_MS).map((d) => d.avg);
  const lastWeek = known.filter((d) => d.t <= now - 7 * DAY_MS).map((d) => d.avg);
  const mean = (a) => (a.length ? Math.round(a.reduce((s, x) => s + x, 0) / a.length) : null);
  const tw = mean(thisWeek);
  const lw = mean(lastWeek);
  const rows = 14;
  return (
    <section className="hud-panel flex flex-col gap-4" aria-labelledby="hr-dots" data-testid="hr-dot-matrix">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="hr-dots" className="hud-title">Resting heart rate · 14 days</h2>
        {tw != null && lw != null && (
          <p className="text-sm text-ink-2">
            {tw === lw ? 'Unchanged' : tw > lw ? `Up ${tw - lw} bpm` : `Down ${lw - tw} bpm`} from last week
          </p>
        )}
      </div>
      <div className="flex flex-wrap items-end gap-6">
        <svg viewBox={`0 0 ${14 * 36} ${rows * 10 + 16}`} className="h-[170px] min-w-0 flex-1" preserveAspectRatio="xMinYMid meet" role="img" aria-label={`Daily mean resting heart rate for 14 days: ${known.map((d) => `${formatDate(d.t)} ${d.avg} bpm`).join(', ') || 'no data'}`}>
          {days.map((d, i) => {
            const n = d.avg == null ? 0 : Math.max(1, Math.min(rows, Math.round((d.avg - 40) / 5)));
            const sev = d.avg == null ? null : classifyHeartRate(d.avg).severity;
            return (
              <g key={d.k} transform={`translate(${i * 36 + 18} 0)`}>
                {Array.from({ length: rows }, (_, r) => (
                  <circle key={r} cx="0" cy={rows * 10 - r * 10} r="3.4" fill={r < n ? SEVERITY_META[sev].color : 'rgb(var(--c-line))'} />
                ))}
                {i % 2 === 0 && <text x="0" y={rows * 10 + 14} textAnchor="middle" fontSize="8" fill="rgb(var(--c-ink-3))">{new Date(d.t).getDate()}</text>}
              </g>
            );
          })}
        </svg>
        <div className="grid flex-none grid-cols-2 gap-3 sm:grid-cols-1">
          <div className="tile min-w-[140px]">
            <p className="text-xs text-ink-3">This week avg</p>
            <p className="num text-[26px] font-semibold">{tw ?? '—'} <span className="text-xs text-ink-3">bpm</span></p>
          </div>
          <div className="tile min-w-[140px]">
            <p className="text-xs text-ink-3">Previous week avg</p>
            <p className="num text-[26px] font-semibold">{lw ?? '—'} <span className="text-xs text-ink-3">bpm</span></p>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function CrewDetail() {
  const { id } = useParams();
  const showToast = useHealthStore((s) => s.showToast);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState('Vitals');
  const [metric, setMetric] = useState('hr');
  const now = useHealthStore((s) => s.clock);

  const load = useCallback(async () => {
    try {
      setData(await api.crewDetail(id));
      setError('');
    } catch (e) {
      setError(e.status === 404 ? 'No crew member with that id.' : 'Ground station API unreachable.');
    }
  }, [id]);
  useEffect(() => {
    load();
    const t = setInterval(load, 30_000);
    return () => clearInterval(t);
  }, [load]);

  const asc = useMemo(() => (data ? sortLogs(data.readings) : []), [data]);
  if (error) return <p className="hud-panel mx-auto max-w-xl text-warn-fg" role="status">{error} <Link to="/surgeon" className="text-accent-text underline">Back to crew</Link></p>;
  if (!data) return <p className="text-ink-3" role="status">Loading health record…</p>;

  const { profile: p, status: s, escalations, devices } = data;
  const env = s.environment;
  const overall = Object.keys(s.severities).length ? worstOf(Object.values(s.severities)) : null;
  const facts = [
    ['Age', p.age != null ? `${p.age} years` : '—'],
    ['Born', p.born ? formatDate(p.born) : '—'],
    ['Sex', p.sex ?? '—'],
    ['Blood type', p.bloodType ?? '—'],
    ['Height', p.heightCm ? `${p.heightCm} cm` : '—'],
    ['Mass', p.massKg ? `${p.massKg} kg` : '—'],
    ['Crew ID', p.id.toUpperCase()],
    ['Callsign', p.callsign ?? '—'],
  ];
  const save = async (eid, body) => {
    try {
      await api.patchEscalation(eid, body);
      showToast(body.status === 'reviewed' ? `Escalation #${eid} marked reviewed.` : 'Note saved.', 'ok');
      load();
    } catch {
      showToast('Could not save: ground link unavailable.', 'warn');
    }
  };

  return (
    <div className="mx-auto flex max-w-page flex-col gap-6" data-testid="crew-detail" data-crew={p.id}>
      <Link to="/surgeon" className="inline-flex min-h-touch w-fit items-center gap-1 text-sm font-semibold text-accent-text">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>
        All crew
      </Link>

      <section className="hud-panel flex flex-wrap-reverse items-center gap-6 p-6" aria-labelledby="crew-name">
        <div className="min-w-[280px] flex-1">
          <p className="eyebrow">Crew health record</p>
          <h1 id="crew-name" className="page-title mt-1">{p.name}</h1>
          <p className="mt-1 text-ink-3">{p.role} · {ENVIRONMENTS[env]?.label ?? env}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {overall ? <StatusBadge severity={overall} /> : <span className="text-sm text-ink-3">No current readings</span>}
            <span className="pill">
              Score <span className="num">{s.score ?? '—'}</span>
              {s.band && <span className="text-ink-3">· {s.band}</span>}
            </span>
            <span className="text-sm text-ink-3">{s.lastLogAt ? `Last log ${formatDate(s.lastLogAt)} ${formatTime(s.lastLogAt)} (${relativeTime(s.lastLogAt)})` : 'No logs yet'}</span>
          </div>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
            {facts.map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-ink-3">{k}</dt>
                <dd className="num text-[15px] font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
        <div className="mx-auto flex-none overflow-hidden rounded-card border border-line bg-surface-2" style={{ width: 220, height: 220 }}>
          <img src={p.avatar} alt={`Portrait of ${p.name} (illustration)`} width="220" height="220" className="h-full w-full object-cover" data-testid="crew-portrait" />
        </div>
      </section>

      <div role="tablist" aria-label="Health record sections" className="flex flex-wrap gap-1.5 rounded-tile border border-line bg-surface p-1">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            id={`tab-${t}`}
            aria-selected={tab === t}
            aria-controls={`panel-${t}`}
            onClick={() => setTab(t)}
            className={`min-h-touch rounded-[10px] px-4 text-sm font-semibold ${tab === t ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}
            data-testid={`crew-tab-${t.toLowerCase()}`}
          >
            {t}
            {t === 'Escalations' && escalations.length > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-ink">{escalations.length}</span>}
            {t === 'Devices' && devices.length > 0 && <span className="ml-1.5 rounded-full bg-surface-2 px-1.5 text-xs text-ink">{devices.length}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="flex flex-col gap-5">
        {tab === 'Vitals' && (
          <>
            <section aria-label="Current vitals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="vitals-grid">
              {INDICATORS.map((m) => {
                const v = s.values[m.id];
                const sev = s.severities[m.id];
                return (
                  <article key={m.id} className="hud-panel flex flex-col gap-2" data-testid={`vital-${m.id}`} data-severity={sev ?? (v?.stale ? 'stale' : 'none')}>
                    <div className="flex items-center justify-between gap-2">
                      <h2 className="text-sm font-semibold text-ink-3">{m.label}</h2>
                      {sev ? <StatusBadge severity={sev} compact /> : <span className="text-xs text-ink-3">{v?.stale ? 'Out of date' : 'No data'}</span>}
                    </div>
                    <p className="num text-[28px] font-semibold">{fmt(m.id, v?.value)} <span className="text-sm font-medium text-ink-3">{m.unit}</span></p>
                    {v && <p className="text-xs text-ink-3">{formatDate(v.ts)} {formatTime(v.ts)} · {v.source === 'manual' ? 'manual' : v.device || SOURCE_LABEL[v.source]}</p>}
                    {s.reasons[m.id] && <p className="text-xs text-ink-2">{s.reasons[m.id]}</p>}
                  </article>
                );
              })}
            </section>
            <HeartDotMatrix logs={asc} now={now} />
            <div className="flex flex-wrap items-start gap-5">
              <div className="min-w-0 flex-[2_1_560px]">
                <TrendPanel logs={asc} environment={env} now={now} metric={metric} onMetric={setMetric} title="14-day trend" />
              </div>
              <section className="hud-panel min-w-0 flex-[1_1_300px]" aria-labelledby="hz-h">
                <h2 id="hz-h" className="hud-title">Hazard insights</h2>
                {s.hazards.length === 0 ? (
                  <p className="mt-2 flex items-center gap-2 text-sm"><StatusIcon severity="green" size={16} /> No hazard patterns.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-2">
                    {s.hazards.map((h) => (
                      <li key={h.id} className="rounded-tile px-3 py-2 text-sm font-semibold" style={{ background: SEVERITY_META[h.severity].bg, color: SEVERITY_META[h.severity].fg }}>
                        {h.title}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
        {tab === 'Logs' && (
          <section className="hud-panel" aria-label="Log entries">
            <p className="text-sm text-ink-3">Last 30 days · {data.readings.length} entries, newest first.</p>
            <LogTable logs={data.readings} allLogs={asc} ctx={{ environment: env }} />
          </section>
        )}
        {tab === 'Escalations' &&
          (escalations.length === 0 ? (
            <p className="hud-panel text-sm text-ink-3">No escalations from {p.name}.</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {escalations.map((e) => (
                <EscalationItem key={`${e.id}-${e.status}`} e={e} onSave={save} showCrew={false} />
              ))}
            </ul>
          ))}
        {tab === 'Devices' && (
          <section className="hud-panel" aria-label="Devices">
            {devices.length === 0 ? (
              <p className="text-sm text-ink-3">No wearables have sent data for {p.name} yet.</p>
            ) : (
              <ul className="divide-y divide-line">
                {devices.map((d) => (
                  <li key={d.deviceId} className="flex flex-wrap items-center gap-3 py-3">
                    <span className={`block h-2.5 w-2.5 rounded-full ${Date.now() - new Date(d.lastSeen).getTime() < 120_000 ? 'bg-ok-dot' : 'bg-ink-3/60'}`} aria-hidden="true" />
                    <span className="font-semibold">{d.deviceName}</span>
                    <span className="text-sm text-ink-3">{d.kind} · last seen {relativeTime(d.lastSeen)}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
