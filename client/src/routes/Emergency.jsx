import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { INDICATORS } from '../config/thresholds.js';
import { formatDelay, selfCareFirst } from '../lib/comms.js';
import { formatIndicatorValue, formatTime } from '../lib/format.js';
import { StatusIcon } from '../components/Status.jsx';
import EscalationDialog from '../components/EscalationDialog.jsx';

/**
 * Emergency checklists: generic first steps for decision support only. They
 * point to the crew medical officer, the on-board medical kit and the mission's
 * own emergency procedures, which always take priority.
 */
const SITUATIONS = [
  {
    id: 'cardiac',
    title: 'Chest pain, irregular or very fast/slow heartbeat',
    steps: [
      'Stop all activity. Anchor yourself and rest.',
      'Alert the crew and the crew medical officer (CMO) now.',
      'CMO: open the medical kit; follow the mission cardiac procedure.',
      'Record heart rate and blood pressure every 5 minutes (log them here).',
      'Send the emergency report to the flight surgeon.',
    ],
  },
  {
    id: 'unresponsive',
    title: 'Crewmate fainted or is not responding',
    steps: [
      'Call the crew. Secure the person so they do not drift.',
      'Check breathing and pulse. If absent, start CPR per the on-board procedure.',
      'Bring the medical kit and defibrillator.',
      'Note the time it started. Send the emergency report.',
    ],
  },
  {
    id: 'hypoglycaemia',
    title: 'Low blood sugar (below 60 mg/dL, shaky, sweaty, confused)',
    steps: [
      'Take 15 g of fast-acting sugar now (glucose gel or juice).',
      'Re-test after 15 minutes. Repeat if still below 70 mg/dL.',
      'Eat a meal or snack once above 70 mg/dL.',
      'If confused or unable to swallow: crewmate gives glucose gel per the kit procedure; alert the CMO.',
    ],
  },
  {
    id: 'temperature',
    title: 'High fever (above 38.0 °C) or hypothermia (below 35.0 °C)',
    steps: [
      'Fever: rest, fluids, mask on, limit contact with crew; medication only as the kit protocol says.',
      'Hypothermia: move to a warm module, remove damp clothing, add layers and warm drinks if alert.',
      'Re-measure temperature every 30 minutes and log it.',
      'Send the emergency report if it does not improve.',
    ],
  },
  {
    id: 'radiation',
    title: 'Solar particle event / radiation alarm',
    steps: [
      'Go to the storm shelter now. Bring water, food and your dosimeter.',
      'Stay until the all-clear. Postpone all EVAs.',
      'Log your dosimeter reading and tick "Solar particle event alert".',
      'Watch the per-event limit (250 mSv) on the dashboard.',
    ],
  },
];

export default function Emergency() {
  const status = useHealthStore((s) => s.status);
  const delaySeconds = useHealthStore((s) => s.delaySeconds);
  const [open, setOpen] = useState(null);
  const [reporting, setReporting] = useState(false);
  const [done, setDone] = useState({});
  const longDelay = selfCareFirst(delaySeconds);
  const actions = Object.entries(done)
    .filter(([, v]) => v)
    .map(([k]) => k);

  return (
    <div className="mx-auto max-w-4xl space-y-4" data-testid="emergency-page">
      <section className="rounded-lg border-2 border-crit-dot bg-crit-bg p-4" role="alert">
        <h1 className="flex items-center gap-3 text-2xl font-bold">
          <StatusIcon severity="red" size={30} /> Emergency mode
        </h1>
        <p className="mt-2 text-lg">
          1. Alert your crew and crew medical officer now. 2. Follow your mission emergency procedures. 3. Send the report below.
        </p>
        <p className="mt-1 text-sm" data-testid="emergency-delay">
          Earth link: {delaySeconds > 0 ? `${formatDelay(delaySeconds)} one-way` : 'real-time'}.{' '}
          {longDelay ? `A reply takes at least ${formatDelay(delaySeconds * 2)}: act now, do not wait for Earth.` : 'The flight surgeon can respond quickly.'}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          <button type="button" className="btn-danger px-6 text-lg" onClick={() => setReporting(true)} data-testid="emergency-report">
            Send emergency report
          </button>
          <Link to="/log" className="btn-ghost">Log new readings</Link>
          <Link to="/" className="btn-ghost">Exit emergency mode</Link>
        </div>
      </section>

      <section className="hud-panel" aria-labelledby="em-status">
        <h2 id="em-status" className="hud-title">Current readings</h2>
        {status.hasData ? (
          <ul className="mt-2 grid gap-2 sm:grid-cols-3">
            {INDICATORS.map((m) => {
              const r = status.results[m.id];
              const snap = status.snapshot[m.id];
              return (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  {r ? <StatusIcon severity={r.severity} size={18} /> : <span className="inline-block h-4 w-4 rounded-full border border-line" aria-hidden="true" />}
                  <span>
                    <strong>{m.short}</strong> {r ? `${formatIndicatorValue(m.id, status.reading)} ${m.unit}` : 'no current value'}
                    {snap && <span className="text-xs text-ink-3"> · {formatTime(snap.ts)}</span>}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-3">No readings logged. Measure heart rate, blood pressure and temperature now if you can.</p>
        )}
      </section>

      <section aria-labelledby="em-check" className="space-y-2">
        <h2 id="em-check" className="text-lg font-bold">What is happening?</h2>
        {SITUATIONS.map((sit) => (
          <div key={sit.id} className="hud-panel">
            <button type="button" className="flex min-h-touch w-full items-center justify-between text-left text-lg font-semibold" aria-expanded={open === sit.id} onClick={() => setOpen(open === sit.id ? null : sit.id)} data-testid={`situation-${sit.id}`}>
              {sit.title}
              <span aria-hidden="true">{open === sit.id ? '−' : '+'}</span>
            </button>
            {open === sit.id && (
              <ol className="mt-2 space-y-1">
                {sit.steps.map((step) => (
                  <li key={step}>
                    <label className="flex min-h-touch items-start gap-3">
                      <input type="checkbox" className="mt-1 h-6 w-6 shrink-0 accent-[#D7333A]" checked={Boolean(done[step])} onChange={(e) => setDone((d) => ({ ...d, [step]: e.target.checked }))} />
                      <span>{step}</span>
                    </label>
                  </li>
                ))}
              </ol>
            )}
          </div>
        ))}
        <p className="text-xs text-ink-3">Checklists are decision support only. The crew medical officer and the mission&apos;s emergency procedures take priority. Ticked steps are added to the report as actions taken.</p>
      </section>
      {reporting && <EscalationDialog priority="emergency" focusId={status.alerts[0]?.id ?? null} presetActions={actions} onClose={() => setReporting(false)} />}
    </div>
  );
}
