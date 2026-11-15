/**
 * Confirm cards for what the assistant proposes. Claude can only propose:
 * nothing reaches the log or the flight surgeon until the astronaut taps.
 */
import { useState } from 'react';
import { useHealthStore } from '../../store/useHealthStore.js';
import { formatTime } from '../../lib/format.js';

const DEVICE = {
  blood_pressure_monitor: 'Blood pressure monitor',
  thermometer: 'Thermometer',
  glucose_meter: 'Glucose meter',
  pulse_oximeter: 'Pulse oximeter',
  other: 'Device',
};

function readingRows(values) {
  const rows = [];
  if (values.sys !== undefined) rows.push(['Blood pressure', `${values.sys}/${values.dia}`, 'mmHg']);
  if (values.hr !== undefined) rows.push(['Heart rate', values.hr, 'bpm']);
  if (values.glucose !== undefined) rows.push(['Glucose', values.glucose, 'mg/dL']);
  if (values.temp !== undefined) rows.push(['Temperature', values.temp.toFixed(1), '°C']);
  return rows;
}

// A rule down the left ties the proposal to the answer above it, without a box inside the chat box.
const shell = 'mt-2.5 w-full border-l-[3px] py-0.5 pl-3 text-sm';

export default function ActionCard({ action, onOpenReport }) {
  const addLog = useHealthStore((s) => s.addLog);
  const addSymptomNote = useHealthStore((s) => s.addSymptomNote);
  const [state, setState] = useState({ status: 'pending', msg: '' });
  const done = state.status !== 'pending' && state.status !== 'error';

  if (state.status === 'dismissed') {
    return <p className="mt-2 text-xs text-ink-3" data-testid={`action-${action.type}`} data-status="dismissed">Dismissed. Nothing was saved.</p>;
  }

  let title;
  let body;
  let confirmLabel;
  let onConfirm;

  if (action.type === 'readings') {
    const rows = readingRows(action.values);
    title = `Numbers read from the ${DEVICE[action.device] ?? 'device'} photo`;
    confirmLabel = 'Save to log';
    body = (
      <>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
          {rows.map(([label, v, unit]) => (
            <div key={label} className="contents">
              <dt className="text-ink-3">{label}</dt>
              <dd className="num font-semibold">{v} <span className="font-normal text-ink-3">{unit}</span></dd>
            </div>
          ))}
        </dl>
        {(action.converted?.glucose || action.converted?.temp) && (
          <p className="mt-1.5 text-xs text-ink-3">
            Converted from {[action.converted.glucose && 'mmol/L', action.converted.temp && '°F'].filter(Boolean).join(' and ')} on the screen.
          </p>
        )}
        {action.unreadable && <p className="mt-1 text-xs text-ink-3">Not read: {action.unreadable}</p>}
        {action.rejected?.length > 0 && <p className="mt-1 text-xs text-warn-fg">Left out because the number is outside a possible range: {action.rejected.join(', ')}.</p>}
        <p className="mt-1.5 text-xs text-ink-2">Check each number against the screen before saving.</p>
      </>
    );
    onConfirm = () => {
      const entry = addLog(action.values, {
        notes: 'Read from a device photo by Evexia AI and checked by the astronaut before saving.',
        source: 'manual',
        device: DEVICE[action.device] ?? 'Device photo',
      });
      setState({ status: 'saved', msg: `Saved to your log at ${formatTime(entry.ts)}.` });
    };
  } else if (action.type === 'symptom_note') {
    title = 'Symptom note';
    confirmLabel = 'Save note';
    body = (
      <>
        <p className="mt-1 font-semibold">{action.summary}</p>
        {action.details && <p className="mt-1 whitespace-pre-wrap text-ink-2">{action.details}</p>}
        <p className="mt-1.5 text-xs text-ink-3">Reminder to check again in {action.recheckHours} hour{action.recheckHours === 1 ? '' : 's'}, shown in Today&apos;s routine.</p>
      </>
    );
    onConfirm = async () => {
      setState({ status: 'saving', msg: 'Saving…' });
      try {
        const saved = await addSymptomNote({ summary: action.summary, details: action.details, recheckHours: action.recheckHours });
        setState({ status: 'saved', msg: `Saved. Check again at ${formatTime(saved.recheckAt)}.` });
      } catch {
        setState({ status: 'error', msg: 'Not saved: the ground link is down. Try again when it returns.' });
      }
    };
  } else if (action.type === 'report') {
    const urgent = action.priority === 'emergency';
    title = urgent ? 'Emergency report for the flight surgeon' : 'Report for the flight surgeon';
    confirmLabel = 'Review and send';
    body = (
      <>
        {action.note && <p className="mt-1 whitespace-pre-wrap text-ink-2">{action.note}</p>}
        <p className="mt-1.5 text-xs text-ink-3">Opens the full report with your readings. You choose whether to send it.</p>
      </>
    );
    onConfirm = () => {
      onOpenReport?.(action);
      setState({ status: 'opened', msg: 'Report opened. It is sent only when you press Send report.' });
    };
  } else {
    return null;
  }

  return (
    <div className={`${shell} ${action.type === 'report' && action.priority === 'emergency' ? 'border-crit-fg' : 'border-accent'}`} data-testid={`action-${action.type}`} data-status={state.status}>
      <p className="text-[13px] font-bold text-ink">{title}</p>
      {body}
      {state.msg && (
        <p role="status" className={`mt-2 text-xs font-semibold ${state.status === 'error' ? 'text-warn-fg' : 'text-ok-fg'}`}>{state.msg}</p>
      )}
      {!done && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${action.type === 'report' && action.priority === 'emergency' ? 'btn-danger' : 'btn-primary'} min-h-touch px-3.5 text-sm`}
            onClick={onConfirm}
            disabled={state.status === 'saving'}
            data-testid={`action-${action.type}-confirm`}
          >
            {confirmLabel}
          </button>
          <button type="button" className="btn-ghost min-h-touch px-3.5 text-sm" onClick={() => setState({ status: 'dismissed', msg: '' })} disabled={state.status === 'saving'}>
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
