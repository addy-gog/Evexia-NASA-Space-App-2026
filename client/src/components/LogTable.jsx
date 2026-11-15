import { useMemo } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';
import { INDICATORS } from '../config/thresholds.js';
import { evaluateLog, missionDayOf } from '../lib/evaluate.js';
import { formatDate, formatTime, formatIndicatorValue, SOURCE_LABEL } from '../lib/format.js';
import { StatusIcon } from './Status.jsx';

/** One cell for a single indicator: formatted value, highlighted if caution or critical. */
function ReadingCell({ indicator, log, result }) {
  const formatted = formatIndicatorValue(indicator.id, log);
  if (formatted === '—') {
    return <span className="text-ink-4 select-none">—</span>;
  }
  const severity = result?.severity;
  const isAlert = severity === 'amber' || severity === 'red';
  const isRed = severity === 'red';

  return (
    <div>
      {isAlert ? (
        <span
          className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 num font-medium text-xs ${
            isRed
              ? 'bg-crit-bg text-crit-fg border border-crit-line'
              : 'bg-warn-bg text-warn-fg border border-warn-line'
          }`}
          title={`${indicator.short}: ${formatted} ${indicator.unit} (${severity})`}
        >
          <StatusIcon severity={severity} size={11} />
          <span>{formatted}</span>
        </span>
      ) : (
        <span className="num font-medium text-ink">{formatted}</span>
      )}
      {indicator.id === 'radiation' && log.spe && (
        <span className="block text-[10px] font-semibold text-crit-fg leading-tight mt-0.5">
          SPE alert
        </span>
      )}
    </div>
  );
}

/** Table of log entries, newest first. Option A: one column per reading for easy day-to-day comparison. */
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
    <div className="mt-2 overflow-x-auto focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded" tabIndex={0} role="region" aria-label="Log entries table">
      <table className="w-full min-w-[960px] text-left text-sm" data-testid="log-table">
        <caption className="sr-only">Log entries, newest first. One column per vital reading.</caption>
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-ink-3">
            <th scope="col" className="py-2.5 pr-4 font-semibold whitespace-nowrap">When</th>
            {!compact && <th scope="col" className="py-2.5 pr-4 font-semibold whitespace-nowrap">Day</th>}
            {INDICATORS.map((m) => (
              <th key={m.id} scope="col" className="py-2.5 pr-4 font-semibold whitespace-nowrap">
                {m.short} <span className="text-[10px] font-normal lowercase tracking-normal text-ink-4">{m.unit}</span>
              </th>
            ))}
            <th scope="col" className="py-2.5 pr-4 font-semibold whitespace-nowrap">Source</th>
            <th scope="col" className="py-2.5 pr-4 font-semibold">Details</th>
            {onDelete && (
              <th scope="col" className="py-2.5 pl-2 text-right">
                <span className="sr-only">Actions</span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ log, results }) => (
            <tr
              key={log.id}
              className="border-b border-line/60 align-top hover:bg-surface-2/40 transition-colors"
              data-testid="log-row"
              data-log-id={log.id}
              data-source={log.source}
            >
              <td className="py-3 pr-4 whitespace-nowrap">
                <div className="num font-medium text-ink leading-tight">{formatDate(log.ts)}</div>
                <div className="num text-xs text-ink-3 leading-tight mt-0.5" data-testid="log-time">{formatTime(log.ts)}</div>
              </td>
              {!compact && (
                <td className="num py-3 pr-4 text-ink-2 whitespace-nowrap">
                  {missionDayOf(log.ts, ctx.missionStart) ?? '—'}
                </td>
              )}
              {INDICATORS.map((m) => (
                <td key={m.id} className="py-3 pr-4 whitespace-nowrap">
                  <ReadingCell indicator={m} log={log} result={results[m.id]} />
                </td>
              ))}
              <td className="py-3 pr-4">
                <div className="flex flex-col items-start gap-1">
                  <span
                    className={`inline-block rounded border px-1.5 py-0.5 text-[11px] leading-tight font-medium ${
                      log.source === 'wearable'
                        ? 'border-accent/40 bg-accent/10 text-accent-text'
                        : log.source === 'sample'
                        ? 'border-line bg-surface-2 text-ink-3'
                        : 'border-line bg-surface-2 text-ink-2'
                    }`}
                  >
                    {SOURCE_LABEL[log.source] ?? log.source}
                  </span>
                  {log.device && (
                    <span className="text-[11px] leading-tight text-ink-3">
                      {log.device}
                    </span>
                  )}
                  {log.pending && (
                    <span className="text-[10px] leading-tight text-warn-fg">
                      Not yet sent to ground
                    </span>
                  )}
                </div>
              </td>
              <td className="max-w-[280px] lg:max-w-[340px] py-3 pr-4 text-xs text-ink-3 leading-relaxed" data-testid="log-notes">
                {log.notes || '—'}
              </td>
              {onDelete && (
                <td className="py-3 pl-2 text-right whitespace-nowrap">
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1 text-xs text-ink-3 hover:text-crit-fg hover:border-crit transition-colors"
                    onClick={() => onDelete(log)}
                    aria-label={`Delete log entry from ${formatDate(log.ts)} ${formatTime(log.ts)}`}
                  >
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
