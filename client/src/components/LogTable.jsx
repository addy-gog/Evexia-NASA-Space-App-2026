import { useMemo } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';
import { INDICATORS } from '../config/thresholds.js';
import { evaluateLog, missionDayOf } from '../lib/evaluate.js';
import { formatDate, formatTime, formatIndicatorValue, SOURCE_LABEL } from '../lib/format.js';
import { StatusIcon } from './Status.jsx';

/** Table of log entries, newest first. Every row: date, time, mission day, source, values with status, details. */
export default function LogTable({ logs, compact = false, onDelete, allLogs, ctx: ctxProp }) {
  const storeLogs = useHealthStore((s) => s.crewLogs);
  const storeCtx = useHealthStore((s) => s.ctx);
  const crewLogs = allLogs ?? storeLogs;
  const ctx = ctxProp ?? storeCtx;
  const rows = useMemo(() => logs.map((l) => ({ log: l, results: evaluateLog(l, crewLogs, ctx) })), [logs, crewLogs, ctx]);

  if (!logs.length) {
    return (
      <p className="mt-2 text-sm text-ink-3" data-testid="log-empty">
        No log entries yet. Log a reading or sync wearable telemetry.
      </p>
    );
  }
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full min-w-[720px] text-left text-sm" data-testid="log-table">
        <caption className="sr-only">Log entries, newest first</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <th scope="col" className="py-2 pr-3">Date</th>
            <th scope="col" className="pr-3">Time</th>
            {!compact && <th scope="col" className="pr-3">Mission day</th>}
            <th scope="col" className="pr-3">Source</th>
            <th scope="col" className="pr-3">Readings</th>
            <th scope="col" className="pr-3">Details</th>
            {onDelete && <th scope="col"><span className="sr-only">Actions</span></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ log, results }) => (
            <tr key={log.id} className="border-b border-line/60 align-top" data-testid="log-row" data-log-id={log.id} data-source={log.source}>
              <td className="num whitespace-nowrap py-2 pr-3">{formatDate(log.ts)}</td>
              <td className="num whitespace-nowrap pr-3" data-testid="log-time">{formatTime(log.ts)}</td>
              {!compact && <td className="num pr-3">{missionDayOf(log.ts, ctx.missionStart) ?? '—'}</td>}
              <td className="pr-3">
                <span className={`rounded border px-1.5 py-0.5 text-xs ${log.source === 'wearable' ? 'border-accent text-accent-text' : log.source === 'sample' ? 'border-line text-ink-3' : 'border-ink-dim'}`}>
                  {SOURCE_LABEL[log.source] ?? log.source}
                </span>
                {log.device && log.source !== 'manual' && <span className="block text-xs text-ink-3">{log.device}</span>}
                {log.pending && <span className="block text-xs text-warn-fg">Not yet sent to ground</span>}
              </td>
              <td className="pr-3">
                <ul className="flex flex-wrap gap-x-3 gap-y-1">
                  {INDICATORS.filter((m) => results[m.id]).map((m) => (
                    <li key={m.id} className="flex items-center gap-1 whitespace-nowrap">
                      <StatusIcon severity={results[m.id].severity} size={14} title={`${m.short} ${results[m.id].severity}`} />
                      <span className="text-ink-3">{m.short}</span>
                      <span className="num">{formatIndicatorValue(m.id, log)}</span>
                      <span className="text-xs text-ink-3">{m.unit}</span>
                    </li>
                  ))}
                  {log.spe && <li className="font-semibold text-crit-fg">SPE alert</li>}
                </ul>
              </td>
              <td className="max-w-[320px] pr-3 text-ink-3" data-testid="log-notes">{log.notes || '—'}</td>
              {onDelete && (
                <td>
                  <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => onDelete(log)} aria-label={`Delete log entry from ${formatDate(log.ts)} ${formatTime(log.ts)}`}>
                    Delete
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
