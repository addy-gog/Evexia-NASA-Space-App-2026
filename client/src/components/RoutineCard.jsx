import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { checkInStreak, dueToday, openRechecks } from '../lib/routine.js';
import { relativeTime, formatTime, formatDate } from '../lib/format.js';
import { useHealthStore } from '../store/useHealthStore.js';

const WEEKDAY = new Intl.DateTimeFormat('en-GB', { weekday: 'narrow' });

/**
 * Today's routine: what still needs measuring today (reminders) and the
 * daily check-in streak (gamification). Both come from the crew member's own logs.
 */
export default function RoutineCard({ logs, snapshot, now }) {
  const streak = useMemo(() => checkInStreak(logs, now), [logs, now]);
  const due = useMemo(() => dueToday(snapshot, now), [snapshot, now]);
  const notes = useHealthStore((s) => s.symptomNotes);
  const setNoteStatus = useHealthStore((s) => s.setSymptomNoteStatus);
  const rechecks = useMemo(() => openRechecks(notes, now), [notes, now]);
  const sameDay = (ts) => new Date(ts).toDateString() === new Date(now).toDateString();

  const streakLine = streak.current === 0
    ? 'Log a full check-in today to start a streak.'
    : streak.loggedToday
      ? `Checked in today. Best run: ${streak.best} day${streak.best === 1 ? '' : 's'}.`
      : 'Check in today to keep it going.';

  return (
    <section className="hud-panel flex flex-col gap-3.5" aria-labelledby="h-routine" data-testid="routine-card">
      <h2 id="h-routine" className="hud-title">Today&apos;s routine</h2>

      <div className="flex items-center gap-4" data-testid="streak" data-streak={streak.current}>
        <div className="flex flex-none flex-col items-center">
          <span className="font-mono text-[34px] font-semibold leading-none tracking-tighter">{streak.current}</span>
          <span className="mt-1 text-[11px] text-ink-3">day{streak.current === 1 ? '' : 's'}</span>
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Check-in streak</p>
          <p className="text-[13px] text-ink-2">{streakLine}</p>
          <ol className="mt-2 flex gap-1.5" aria-label={`Last 7 days: ${streak.weekCount} of 7 checked in`}>
            {streak.week.map((d, i) => (
              <li key={d.key} className="flex flex-col items-center gap-1">
                <span
                  className={`block h-3.5 w-6 rounded-[4px] ${d.done ? 'bg-accent' : i === 6 ? 'border-2 border-accent bg-surface' : 'bg-surface-2'}`}
                  aria-hidden="true"
                />
                <span className="text-[10px] text-ink-3" aria-hidden="true">{WEEKDAY.format(new Date(`${d.key}T12:00:00`))}</span>
                <span className="sr-only">{d.key}: {d.done ? 'checked in' : 'no check-in'}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>

      {rechecks.length > 0 && (
        <div className="border-t border-line pt-3" data-testid="rechecks">
          <p className="text-sm font-semibold">
            Symptoms to check again <span className="font-normal text-ink-3">({rechecks.length})</span>
          </p>
          <ul className="mt-1.5 flex flex-col">
            {rechecks.slice(0, 3).map((n) => (
              <li key={n.id} className="flex items-center gap-3 border-b border-line/60 py-1.5 text-sm last:border-0" data-testid="recheck" data-due={n.due}>
                <span className={`block h-2 w-2 flex-none rounded-full ${n.due ? 'bg-warn-dot' : 'bg-[#9AA6B8]'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{n.summary}</span>
                  <span className={`text-xs ${n.due ? 'font-semibold text-warn-fg' : 'text-ink-3'}`}>
                    {n.due ? 'Check now' : `Check at ${formatTime(n.recheckAt)}${sameDay(n.recheckAt) ? '' : `, ${formatDate(n.recheckAt)}`}`}
                  </span>
                </span>
                <button type="button" className="btn-ghost min-h-touch flex-none px-3 text-xs" onClick={() => setNoteStatus(n.id, 'done')}>
                  Done<span className="sr-only">: {n.summary}</span>
                </button>
              </li>
            ))}
          </ul>
          {rechecks.length > 3 && <p className="mt-1 text-xs text-ink-3">and {rechecks.length - 3} more in History</p>}
          {rechecks.some((n) => n.due) && <p className="mt-1.5 text-xs text-ink-2">Worse, or no better? Ask Evexia AI to prepare a report for the flight surgeon.</p>}
        </div>
      )}

      <div className="border-t border-line pt-3" data-testid="due-today">
        {due.length === 0 ? (
          <p className="text-sm text-ok-fg">All six readings taken today.</p>
        ) : (
          <>
            <p className="text-sm font-semibold">
              Still to measure today <span className="font-normal text-ink-3">({due.length} of 6)</span>
            </p>
            <ul className="mt-1.5 flex flex-col">
              {due.slice(0, 4).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 border-b border-line/60 py-1.5 text-sm last:border-0" data-testid={`due-${d.id}`}>
                  <span className="flex items-center gap-2">
                    <span className={`block h-2 w-2 flex-none rounded-full ${d.overdue ? 'bg-warn-dot' : 'bg-[#9AA6B8]'}`} aria-hidden="true" />
                    {d.label}
                  </span>
                  <span className={`text-xs ${d.overdue ? 'font-semibold text-warn-fg' : 'text-ink-3'}`}>
                    {d.lastTs ? `last ${relativeTime(d.lastTs, now)}` : 'not logged yet'}
                    {d.overdue && <span className="sr-only"> (overdue)</span>}
                  </span>
                </li>
              ))}
            </ul>
            {due.length > 4 && <p className="mt-1 text-xs text-ink-3">and {due.length - 4} more</p>}
            <Link to="/log" className="btn-primary mt-3 w-full justify-center text-sm" data-testid="routine-log">
              Log today&apos;s readings
            </Link>
          </>
        )}
      </div>
    </section>
  );
}
