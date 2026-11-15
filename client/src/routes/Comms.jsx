/**
 * Earth link (/comms): the link switch for the demo, and every report's journey to the flight
 * surgeon. A store-and-forward simulation inspired by NASA's Delay/Disruption Tolerant
 * Networking; it is not the DTN protocol.
 */
import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { api } from '../lib/api.js';
import { formatDelay } from '../lib/comms.js';
import { formatDateTime } from '../lib/format.js';
import { JOURNEY, reachedIndex, stepSentence } from '../lib/linkSteps.js';
import { StatusBadge } from '../components/Status.jsx';
import EscalationDialog from '../components/EscalationDialog.jsx';

const SPEEDS = [
  { value: 1, label: 'Real time' },
  { value: 1 / 30, label: 'Demo, 30× faster' },
];

function Stamp({ label, at }) {
  if (!at) return null;
  return (
    <span className="text-xs text-ink-3">
      {label} <span className="num text-ink-2">{formatDateTime(at)}</span>
    </span>
  );
}

function ReportJourney({ e, delayText }) {
  const reached = reachedIndex(e.link.step);
  const emergency = e.priority === 'emergency';
  return (
    <li className={`rounded-card border p-4 ${emergency ? 'border-crit-line bg-crit-bg/40' : 'border-line bg-surface'}`} data-testid={`journey-${e.id}`} data-step={e.link.step}>
      <div className="flex flex-wrap items-center gap-2">
        {emergency && <span className="rounded-full bg-crit-fg px-2 py-0.5 text-xs font-bold text-white">EMERGENCY</span>}
        <p className="font-semibold">Report #{e.id}</p>
        <StatusBadge severity={e.payload.overallSeverity} compact />
        <span className="ml-auto"><Stamp label="Written" at={e.payload.createdAt} /></span>
      </div>
      {e.payload.focusIndicator && <p className="mt-1 text-sm text-ink-2">{e.payload.focusIndicator}</p>}

      <ol className="mt-3 grid grid-cols-5 gap-1" aria-label="Journey">
        {JOURNEY.map((s, i) => {
          const done = i <= reached;
          return (
            <li key={s.id} className="flex flex-col gap-1.5">
              <span className={`block h-1.5 rounded-full ${done ? (e.link.step === 'waiting' && i === 0 ? 'bg-warn-dot' : 'bg-accent') : 'bg-ink/10'}`} aria-hidden="true" />
              <span className={`text-[12px] leading-tight ${done ? 'font-semibold text-ink' : 'text-ink-3'}`}>
                {s.label}
                <span className="sr-only">{done ? ': done' : ': not yet'}</span>
              </span>
            </li>
          );
        })}
      </ol>
      <p className={`mt-3 text-sm ${e.link.step === 'waiting' ? 'font-semibold text-warn-fg' : 'text-ink-2'}`} role="status">{stepSentence(e.link.step, delayText)}</p>
      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
        <Stamp label="Sent" at={e.link.sentAt} />
        <Stamp label="Arrival confirmed" at={e.link.confirmedAt} />
        <Stamp label="Reply received" at={e.link.reply?.receivedAt} />
      </div>
      {e.link.reply?.kind === 'reply' && (
        <blockquote className="mt-3 rounded-tile border-l-4 border-accent bg-surface-2 px-3 py-2 text-sm" data-testid={`reply-${e.id}`}>
          <p className="text-xs font-semibold text-ink-3">Flight surgeon, written <span className="num">{formatDateTime(e.link.reply.writtenAt)}</span></p>
          <p className="mt-1 whitespace-pre-wrap text-ink">{e.link.reply.text}</p>
        </blockquote>
      )}
    </li>
  );
}

export default function Comms() {
  const link = useHealthStore((s) => s.earthLink);
  const setEarthLink = useHealthStore((s) => s.setEarthLink);
  const delay = useHealthStore((s) => s.delaySeconds);
  const showToast = useHealthStore((s) => s.showToast);
  const [reports, setReports] = useState(null);
  const [error, setError] = useState('');
  const [writing, setWriting] = useState(false);
  const delayText = delay > 0 ? formatDelay(delay) : 'no time';

  const load = useCallback(async () => {
    try {
      const res = await api.escalations();
      setReports(res.escalations);
      setError('');
    } catch {
      setError('The onboard server is unreachable, so the report list cannot refresh. Reports already saved on this device are kept.');
      setReports((r) => r ?? []);
    }
  }, []);
  useEffect(() => {
    load();
    const id = setInterval(load, 2000);
    return () => clearInterval(id);
  }, [load]);

  const change = async (body) => {
    try {
      await setEarthLink(body);
      load();
    } catch {
      showToast('Could not change the link: the onboard server is unreachable.', 'warn');
    }
  };
  const blackout = link?.mode === 'blackout';
  const demoSeconds = link && link.timeScale > 0 && delay > 0 ? Math.round(delay * link.timeScale) : null;

  return (
    <div className="mx-auto flex max-w-[960px] flex-col gap-5">
      <div>
        <p className="eyebrow">Communications</p>
        <h1 className="page-title mt-1">Earth link</h1>
        <p className="mt-1.5 max-w-[62ch] text-ink-3">
          Reports to the flight surgeon wait on board until the link to Earth is up, then take about {delayText} to arrive. You see &ldquo;Arrived&rdquo; only once the receipt has made it back.
        </p>
      </div>

      <section className="hud-panel flex flex-col gap-4" aria-labelledby="link-h" data-testid="link-panel" data-mode={link?.mode ?? 'unknown'}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={`block h-3 w-3 rounded-full ${blackout ? 'bg-warn-dot' : 'blink bg-ok-dot'}`} aria-hidden="true" />
          <h2 id="link-h" className="font-display text-xl font-semibold">{blackout ? 'Link down: blackout' : `Link up · about ${delayText} one-way`}</h2>
          {link?.waiting > 0 && <span className="pill text-warn-fg" data-testid="link-waiting">{link.waiting} waiting on board</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          <div role="group" aria-label="Earth link" className="flex gap-1 rounded-tile border border-line bg-surface p-1">
            {[['up', 'Link up'], ['blackout', 'Blackout']].map(([v, l]) => (
              <button key={v} type="button" aria-pressed={link?.mode === v} onClick={() => change({ mode: v })} data-testid={`link-${v}`} className={`min-h-touch rounded-[10px] px-4 text-sm font-semibold ${link?.mode === v ? (v === 'blackout' ? 'bg-warn-dot text-white' : 'bg-accent text-white') : 'text-ink-2 hover:bg-surface-2'}`}>
                {l}
              </button>
            ))}
          </div>
          <div role="group" aria-label="Delay speed" className="flex gap-1 rounded-tile border border-line bg-surface p-1">
            {SPEEDS.map((s) => (
              <button key={s.label} type="button" aria-pressed={Math.abs((link?.timeScale ?? -1) - s.value) < 1e-6} onClick={() => change({ timeScale: s.value })} className={`min-h-touch rounded-[10px] px-4 text-sm font-semibold ${Math.abs((link?.timeScale ?? -1) - s.value) < 1e-6 ? 'bg-accent text-white' : 'text-ink-2 hover:bg-surface-2'}`}>
                {s.label}
              </button>
            ))}
          </div>
          {demoSeconds !== null && link.timeScale < 1 && <span className="text-xs text-ink-3">Demo: {delayText} takes about {demoSeconds} s.</span>}
          {link?.timeScale === 0 && <span className="text-xs text-ink-3">Instant (test mode).</span>}
        </div>
        <p className="max-w-[70ch] text-xs text-ink-3">
          Simulation inspired by NASA&apos;s Delay/Disruption Tolerant Networking (store and forward). It is not the DTN protocol. In a blackout nothing new leaves; anything already travelling keeps going.
        </p>
      </section>

      <section className="flex flex-col gap-3" aria-labelledby="reports-h">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="reports-h" className="hud-title">Reports to the flight surgeon</h2>
          <button type="button" className="btn-primary min-h-touch text-sm" onClick={() => setWriting(true)} data-testid="comms-new-report">Send a report</button>
        </div>
        {error && <p className="rounded-tile bg-warn-bg px-4 py-3 text-sm font-semibold text-warn-fg" role="status">{error}</p>}
        {reports === null ? (
          <p className="text-ink-3" role="status">Loading reports</p>
        ) : reports.length === 0 ? (
          <p className="hud-panel text-sm text-ink-3">
            No reports yet. Send one from here, from <Link to="/emergency" className="font-semibold text-accent-text underline">Emergency</Link>, or with Escalate on the Console.
          </p>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="journey-list">
            {reports.map((e) => <ReportJourney key={e.id} e={e} delayText={delayText} />)}
          </ul>
        )}
      </section>

      {writing && <EscalationDialog focusId={null} onClose={() => setWriting(false)} onSent={() => load()} />}
    </div>
  );
}
