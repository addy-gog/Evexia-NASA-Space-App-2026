import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../../store/useHealthStore.js';
import { api } from '../../lib/api.js';
import { INDICATORS, TRIAGE } from '../../config/thresholds.js';
import { worstOf } from '../../lib/severity.js';
import { formatDate, relativeTime } from '../../lib/format.js';
import { StatusBadge, StatusIcon, SEVERITY_META } from '../../components/Status.jsx';
import { Avatar } from '../../components/Brand.jsx';
import EscalationItem from '../../components/EscalationItem.jsx';

function ScoreMini({ score, band }) {
  const sev = band === 'Mission ready' ? 'green' : band === 'Monitor closely' ? 'amber' : band ? 'red' : null;
  const C = 2 * Math.PI * 20;
  return (
    <div className="relative h-[52px] w-[52px] flex-none">
      <svg width="52" height="52" viewBox="0 0 52 52" role="img" aria-label={score == null ? 'No score' : `Health score ${score}, ${band}`}>
        <circle cx="26" cy="26" r="20" fill="none" stroke="rgb(var(--c-line))" strokeWidth="6" />
        {score != null && <circle cx="26" cy="26" r="20" fill="none" stroke={SEVERITY_META[sev].color} strokeWidth="6" strokeLinecap="round" strokeDasharray={`${(score / 100) * C} ${C}`} transform="rotate(-90 26 26)" />}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-sm font-semibold">{score ?? '—'}</span>
    </div>
  );
}

const fmt = (id, v) => (v == null ? '—' : id === 'temp' || id === 'sleep' ? Number(v).toFixed(1) : id === 'radiation' ? Number(v).toFixed(2) : v);

function TriageLine({ t, position }) {
  if (!t?.tier) return null;
  const tier = TRIAGE.tiers[t.tier];
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" data-testid="triage-line" data-tier={t.tier} data-priority={t.priority}>
      <span className="num rounded-full bg-ink/[0.06] px-2 py-0.5 font-bold text-ink" aria-label={`Queue position ${position}`}>#{position}</span>
      <span className="flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-bold" style={{ background: SEVERITY_META[t.tier].bg, color: SEVERITY_META[t.tier].fg, boxShadow: `inset 0 0 0 1px ${SEVERITY_META[t.tier].line}` }}>
        IITT {tier.colour} · {tier.target}
      </span>
      {t.top && <span className="font-semibold text-ink-2">ABCDE {t.top.letter} · {t.top.label}</span>}
      {t.flags > 1 && <span className="text-ink-3">{t.flags} flags</span>}
    </div>
  );
}

function CrewCard({ c, position }) {
  const overall = Object.keys(c.severities).length ? worstOf(Object.values(c.severities)) : null;
  return (
    <article className="hud-panel flex w-full flex-col gap-4" data-testid={`crew-card-${c.id}`} data-severity={overall ?? 'none'}>
      <TriageLine t={c.triage} position={position} />
      <div className="flex items-center gap-3.5">
        <Avatar src={c.avatar} name={c.name} size={64} label={`Portrait of ${c.name}`} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-lg font-semibold">
            <Link to={`/surgeon/crew/${c.id}`} className="underline-offset-2 hover:underline" data-testid={`crew-link-${c.id}`}>{c.name}</Link>
          </h2>
          <p className="truncate text-sm text-ink-3">{c.role}</p>
          <p className="font-mono text-xs text-ink-3">{c.callsign} · {c.id.toUpperCase()}</p>
        </div>
        <ScoreMini score={c.score} band={c.band} />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {overall ? <StatusBadge severity={overall} compact /> : <span className="text-xs text-ink-3">No current readings</span>}
        <span className="text-xs text-ink-3">{c.lastLogAt ? `Last log ${relativeTime(c.lastLogAt)}` : 'No logs yet'}</span>
      </div>
      <ul className="grid grid-cols-3 gap-2">
        {INDICATORS.map((m) => {
          const v = c.values[m.id];
          const sev = c.severities[m.id];
          return (
            <li key={m.id} className="tile flex flex-col gap-0.5 p-2.5" data-indicator={m.id} data-severity={sev ?? 'none'}>
              <span className="flex items-center gap-1 text-[11px] font-semibold text-ink-3">
                {sev && <StatusIcon severity={sev} size={12} />}
                {m.short}
              </span>
              <span className="num text-[15px] font-semibold">{fmt(m.id, v?.value)}</span>
            </li>
          );
        })}
      </ul>
      {c.hazards?.[0] && (
        <p className="rounded-tile px-3 py-2 text-xs font-semibold" style={{ background: SEVERITY_META[c.hazards[0].severity].bg, color: SEVERITY_META[c.hazards[0].severity].fg }}>
          {c.hazards[0].title}
        </p>
      )}
      <Link to={`/surgeon/crew/${c.id}`} className="btn-ghost mt-auto text-sm">Open health record</Link>
    </article>
  );
}

export default function SurgeonOverview() {
  const user = useHealthStore((s) => s.user);
  const showToast = useHealthStore((s) => s.showToast);
  const [crew, setCrew] = useState(null);
  const [esc, setEsc] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const [c, e] = await Promise.all([api.crew(), api.escalations()]);
      setCrew(c.crew);
      setEsc(e.escalations);
      setError('');
    } catch {
      setError('Ground station API unreachable. Crew data cannot be loaded.');
      setCrew((x) => x ?? []);
      setEsc((x) => x ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, [load]);

  const save = async (id, body) => {
    try {
      await api.patchEscalation(id, body);
      showToast(body.status === 'reviewed' ? `Escalation #${id} marked reviewed.` : 'Note saved.', 'ok');
      load();
    } catch {
      showToast('Could not save: ground link unavailable.', 'warn');
    }
  };

  const list = crew ?? [];
  const overallOf = (c) => (Object.keys(c.severities).length ? worstOf(Object.values(c.severities)) : null);
  const nominal = list.filter((c) => overallOf(c) === 'green').length;
  const attention = list.filter((c) => ['amber', 'red'].includes(overallOf(c))).length;
  const open = (esc ?? []).filter((e) => e.status !== 'reviewed');
  const emergencies = open.filter((e) => e.priority === 'emergency').length;
  const avatarOf = Object.fromEntries(list.map((c) => [c.id, c.avatar]));
  // Triage queue: the server already sends this order; sorting again keeps it right if it ever does not.
  const queue = [...list].sort((a, b) => (b.triage?.priority ?? 0) - (a.triage?.priority ?? 0) || (a.score ?? 101) - (b.score ?? 101));
  const first = (user?.name || '').replace(/^Dr\.\s*/, '').split(' ')[0];

  return (
    <div className="mx-auto flex max-w-page flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Flight surgeon</p>
          <h1 className="page-title mt-1">Welcome, Dr. {first || 'Surgeon'}</h1>
          <p className="mt-1 text-ink-3">{formatDate(Date.now())} · five crew members · status from each person&apos;s latest logs.</p>
        </div>
        <button type="button" className="btn-ghost" onClick={load}>Refresh</button>
      </div>
      {error && <p className="rounded-tile bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg" role="status">{error}</p>}

      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Crew mission ready', `${nominal}/${list.length || 5}`, '34,197,94', 'rgb(var(--ok-fg))', 'M5 12l5 5L20 7'],
          ['Need attention', String(attention), '245,158,11', 'rgb(var(--warn-fg))', 'M12 3l10 18H2zM12 10v4M12 18h.01'],
          ['Open escalations', String(open.length), '255,77,85', 'rgb(var(--accent-text))', 'M4 12h12M12 6l6 6-6 6'],
          ['Emergencies', String(emergencies), '244,63,94', 'rgb(var(--crit-fg))', 'M8 2h8l6 6v8l-6 6H8l-6-6V8zM12 7v6M12 17h.01'],
        ].map(([label, value, rgb, fg, icon]) => (
          <div
            key={label}
            className="hud-panel flex items-center gap-4 overflow-hidden"
            style={{ backgroundImage: `radial-gradient(120% 140% at 0% 0%, rgba(${rgb},0.20), transparent 60%)` }}
            data-testid={`summary-${label.split(' ')[0].toLowerCase()}`}
          >
            <span className="grid h-12 w-12 flex-none place-items-center rounded-full" style={{ background: `rgba(${rgb},0.16)`, boxShadow: `inset 0 0 0 1px rgba(${rgb},0.35)` }} aria-hidden="true">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={icon} /></svg>
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{ color: fg }}>{label}</p>
              <p className="num text-[34px] font-semibold leading-tight text-ink">{value}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="flex flex-wrap items-start gap-6">
        <section aria-labelledby="crew-h" className="min-w-0 flex-[2_1_620px]">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="crew-h" className="hud-title">Crew triage queue</h2>
            <p className="text-xs text-ink-3">IITT colour first (red, yellow, green), then ABCDE: airway/breathing, circulation, disability, exposure, behaviour.</p>
          </div>
          {crew === null ? (
            <p className="text-ink-3" role="status">Loading crew…</p>
          ) : (
            <ol className="grid gap-4 md:grid-cols-2" data-testid="crew-grid" aria-label="Crew in triage order, most urgent first">
              {queue.map((c, i) => (
                <li key={c.id} className="flex min-w-0">
                  <CrewCard c={c} position={i + 1} />
                </li>
              ))}
            </ol>
          )}
        </section>
        <section aria-labelledby="inbox-h" className="min-w-0 flex-[1_1_340px]">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="inbox-h" className="hud-title">Incoming escalations</h2>
            <Link to="/surgeon/escalations" className="text-sm font-semibold text-accent-text underline-offset-2 hover:underline">All</Link>
          </div>
          {esc === null ? (
            <p className="text-ink-3" role="status">Loading…</p>
          ) : open.length === 0 ? (
            <p className="hud-panel flex items-center gap-2 text-sm"><StatusIcon severity="green" size={18} /> No open escalations.</p>
          ) : (
            <ul className="flex flex-col gap-3" data-testid="inbox">
              {open.slice(0, 4).map((e) => (
                <EscalationItem key={`${e.id}-${e.status}`} e={e} avatar={avatarOf[e.crewId]} onSave={save} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
