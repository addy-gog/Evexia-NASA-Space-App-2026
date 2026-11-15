import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { INDICATORS, TELEMETRY_METRICS, READING_FIELDS } from '../config/thresholds.js';
import BodyView from '../components/BodyView.jsx';
import LogTable from '../components/LogTable.jsx';
import EscalationDialog from '../components/EscalationDialog.jsx';
import { StatusIcon } from '../components/Status.jsx';
import {
  ReadingCard,
  HealthScoreRing,
  EarthLinkCard,
  HazardList,
  TrendPanel,
  GuidancePanel,
  EnvironmentSegmented,
  BaselineSwitch,
  useConsoleSelection,
} from '../components/ConsolePanels.jsx';
import { evaluateCurrent } from '../lib/evaluate.js';
import { validateReading } from '../lib/severity.js';
import { selfCareFirst, formatDelay } from '../lib/comms.js';
import { formatTime, formatDose } from '../lib/format.js';

const str = (v) => (v === undefined || v === null ? '' : String(v));

function greeting(name, now) {
  const h = new Date(now).getHours();
  const first = (name || '').replace(/^(Cdr\.|Dr\.)\s*/, '').split(' ')[0];
  return `${h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'}${first ? `, ${first}` : ''}`;
}

function LiveStrip() {
  const samples = useHealthStore((s) => s.telemetry.samples);
  const crewId = useHealthStore((s) => s.crewId);
  const stream = useHealthStore((s) => s.telemetry.stream);
  const now = useHealthStore((s) => s.clock);
  const latest = useMemo(() => {
    const out = {};
    for (const x of samples) if (x.crewId === crewId && (!out[x.metric] || new Date(x.ts) >= new Date(out[x.metric].ts))) out[x.metric] = x;
    return out;
  }, [samples, crewId]);
  const recent = Object.values(latest).filter((x) => now - new Date(x.ts).getTime() < 10 * 60_000);
  return (
    <section className="hud-panel flex flex-wrap items-center gap-x-5 gap-y-2" aria-label="Live wearable telemetry" data-testid="live-strip">
      <h2 className="hud-title flex items-center gap-2">
        <span className={`block h-2 w-2 rounded-full ${stream === 'live' ? 'blink bg-ok-dot' : 'bg-[#9AA6B8]'}`} aria-hidden="true" />
        Live wearables
      </h2>
      {recent.length ? (
        recent.map((x) => (
          <p key={x.metric} className="text-sm">
            <span className="text-ink-3">{TELEMETRY_METRICS[x.metric].label}</span>{' '}
            <strong className="num">{x.metric === 'radiation' ? formatDose(x.value) : x.value}</strong> {TELEMETRY_METRICS[x.metric].unit}
            <span className="text-xs text-ink-3"> · {formatTime(x.ts)}</span>
          </p>
        ))
      ) : (
        <p className="text-sm text-ink-3">No live device data in the last 10 minutes{stream === 'live' ? '' : ' (stream offline)'}.</p>
      )}
      <Link to="/telemetry" className="btn-ghost ml-auto min-h-touch py-1 text-sm">
        {recent.length ? 'Sync to log' : 'Connect a wearable'}
      </Link>
    </section>
  );
}

export default function Dashboard() {
  const crewLogs = useHealthStore((s) => s.crewLogs);
  const ctx = useHealthStore((s) => s.ctx);
  const storeStatus = useHealthStore((s) => s.status);
  const environment = useHealthStore((s) => s.environment);
  const delaySeconds = useHealthStore((s) => s.delaySeconds);
  const baselineMode = useHealthStore((s) => s.baselineMode);
  const baseline = useHealthStore((s) => s.baseline);
  const profile = useHealthStore((s) => s.profile);
  const user = useHealthStore((s) => s.user);
  const now = useHealthStore((s) => s.clock);
  const crewId = useHealthStore((s) => s.crewId);
  const { setEnvironment, setBaselineMode, addLog, showToast } = useHealthStore.getState();
  const { selected, metric, select, setMetric } = useConsoleSelection('sleep');
  const [draft, setDraft] = useState(null);
  const [escalating, setEscalating] = useState(false);
  const [sentInfo, setSentInfo] = useState(null);

  // Current values (from the latest logs) as editable strings.
  const base = useMemo(() => {
    const s = storeStatus.snapshot;
    return {
      hr: str(s.hr?.value), sys: str(s.bp?.sys), dia: str(s.bp?.dia), glucose: str(s.glucose?.value),
      temp: str(s.temp?.value), sleep: str(s.sleep?.value), radiation: str(s.radiation?.value),
    };
  }, [storeStatus]);
  const values = draft ?? base;
  const edited = draft ? READING_FIELDS.filter((f) => draft[f] !== base[f] && draft[f] !== '') : [];
  const editedNumeric = Object.fromEntries(edited.map((f) => [f, Number(draft[f])]));
  const errors = validateReading(editedNumeric);
  for (const f of edited) if (Number.isNaN(editedNumeric[f])) errors[f] = 'Enter a number.';
  const valid = edited.length > 0 && !Object.keys(errors).length;

  // Live preview: the edited values as if logged now.
  const status = useMemo(() => {
    if (!valid) return storeStatus;
    const draftLog = { id: '__draft', crewId, ts: new Date(now).toISOString(), ...editedNumeric, environment, source: 'manual' };
    return evaluateCurrent([...crewLogs, draftLog], ctx, now);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valid, storeStatus, crewLogs, ctx, now, environment, crewId, JSON.stringify(editedNumeric)]);

  const counts = [0, 0, 0];
  for (const m of INDICATORS) {
    const r = status.results[m.id];
    if (r) counts[{ green: 0, amber: 1, red: 2 }[r.severity]] += 1;
  }
  const anyCritical = counts[2] > 0;
  const longDelay = selfCareFirst(delaySeconds);

  const onChange = (field, v) => setDraft({ ...(draft ?? base), [field]: v });
  const save = () => {
    const entry = addLog(editedNumeric, { notes: 'Logged from the console.', source: 'manual', device: 'Manual entry' });
    setDraft(null);
    showToast(`Saved to your log at ${formatTime(entry.ts)}. Status updated.`, 'ok');
  };

  return (
    <div className="mx-auto flex max-w-page flex-col gap-5">
      <section className="flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="min-w-[280px] flex-1">
          <h1 className="page-title" data-testid="greeting">{greeting(profile?.name ?? user?.name, now)}</h1>
          <p className="mt-1.5 max-w-[620px] text-ink-3">
            Your six readings on your body, with the next step for each. Judged against spaceflight-adjusted ranges{baselineMode ? ', compared with your own pre-flight normal' : ''}.
          </p>
        </div>
        <div className="flex min-w-0 max-w-full flex-wrap items-center gap-3">
          <EnvironmentSegmented value={environment} onChange={setEnvironment} />
          <BaselineSwitch on={baselineMode} onToggle={() => setBaselineMode(!baselineMode)} />
        </div>
      </section>

      {anyCritical && (
        <section className="flex flex-wrap items-center gap-3 rounded-card border border-crit-line bg-crit-bg p-4" role="alert" data-testid="emergency-prompt">
          <StatusIcon severity="red" size={22} />
          <p className="text-sm text-ink">
            <strong className="text-crit-fg">Critical reading.</strong> Follow the self-care step and escalate to the flight surgeon{longDelay ? ` (Earth link ${formatDelay(delaySeconds)})` : ''}. If symptoms are severe, open emergency mode.
          </p>
          <Link to="/emergency" className="btn-danger ml-auto">Emergency mode</Link>
        </section>
      )}

      {edited.length > 0 && (
        <section className="sticky top-[76px] z-20 flex flex-wrap items-center gap-3 rounded-card border border-accent bg-surface p-3.5 shadow-float" aria-label="Unsaved readings" data-testid="draft-bar">
          <span className="block h-2.5 w-2.5 rounded-full bg-accent" aria-hidden="true" />
          <p className="text-sm">
            <strong>{edited.length} edited reading{edited.length > 1 ? 's' : ''}</strong> preview on your body. {Object.values(errors)[0] ? <span className="font-semibold text-crit-fg">{Object.values(errors)[0]}</span> : 'Save them as a log entry timed now.'}
          </p>
          <div className="ml-auto flex gap-2">
            <button type="button" className="btn-ghost" onClick={() => setDraft(null)}>Discard</button>
            <button type="button" className="btn-primary" onClick={save} disabled={!valid} data-testid="save-draft">Save to log</button>
          </div>
        </section>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <section aria-labelledby="h-readings" className="hud-panel flex min-w-0 flex-[1_1_340px] flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 id="h-readings" className="hud-title">Current readings</h2>
            <span className="text-xs text-ink-3">Type or drag to update</span>
          </div>
          {INDICATORS.map((m) => (
            <ReadingCard
              key={m.id}
              meta={m}
              result={status.results[m.id]}
              snap={storeStatus.snapshot[m.id]}
              values={values}
              onChange={onChange}
              selected={selected === m.id}
              onSelect={select}
              baselineMode={baselineMode}
              baseline={baseline}
              environment={environment}
              now={now}
              edited={edited.some((f) => (m.id === 'bp' ? f === 'sys' || f === 'dia' : f === m.id))}
            />
          ))}
          <Link to="/log" className="btn-ghost text-sm" data-testid="log-readings-cta">Log with date, time and details</Link>
        </section>

        <div className="min-w-0 flex-[1.35_1_420px]">
          <BodyView status={status} selected={selected} onSelect={select} />
        </div>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-5">
          <HealthScoreRing score={status.score} counts={counts} />
          <EarthLinkCard environment={environment} delaySeconds={delaySeconds} anyCritical={anyCritical} onSend={() => setEscalating(true)} sentInfo={sentInfo} />
          <HazardList results={status.results} hazards={status.hazards} delaySeconds={delaySeconds} />
        </div>
      </div>

      <div className="flex flex-wrap items-start gap-5">
        <div className="min-w-0 flex-[2_1_560px]">
          <TrendPanel logs={crewLogs} environment={environment} now={now} metric={metric} onMetric={setMetric} />
        </div>
        <div className="min-w-0 flex-[1_1_340px]">
          <GuidancePanel results={status.results} reading={status.reading} onSelect={select} />
        </div>
      </div>

      <LiveStrip />

      <section className="hud-panel" aria-labelledby="dash-recent">
        <div className="flex items-center justify-between">
          <h2 id="dash-recent" className="hud-title">Latest log entries</h2>
          <Link to="/history" className="inline-flex min-h-touch items-center text-sm font-semibold text-accent underline-offset-2 hover:underline">History</Link>
        </div>
        <LogTable logs={[...crewLogs].reverse().slice(0, 5)} compact />
      </section>

      {escalating && (
        <EscalationDialog
          focusId={status.alerts[0]?.id ?? null}
          onClose={() => setEscalating(false)}
          onSent={(saved) => setSentInfo({ at: saved.createdAt ?? new Date().toISOString() })}
        />
      )}
    </div>
  );
}
