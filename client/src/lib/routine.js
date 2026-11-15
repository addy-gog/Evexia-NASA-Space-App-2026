/**
 * Daily routine: check-in streaks (gamification) and "due today" reminders.
 *
 * The challenge brief suggests prompting astronauts to take measurements as part of
 * the mission routine and a gamification system for health tasks. Both are derived
 * from the crew member's own log entries. Pure functions: no store, no clock reads.
 */
import { INDICATORS } from '../config/thresholds.js';
import { DAY_MS, dayKey, sortLogs } from './evaluate.js';

/** Readings a full daily check-in should include (the six indicators). */
const CHECK_IN_MIN_READINGS = 4;

const has = (v) => typeof v === 'number' && Number.isFinite(v);

/** How many of the six indicators one log entry covers (blood pressure needs both numbers). */
export function readingsIn(log) {
  let n = 0;
  for (const m of INDICATORS) {
    if (m.id === 'bp' ? has(log.sys) && has(log.dia) : has(log[m.id])) n += 1;
  }
  return n;
}

/** A full check-in covers at least four of the six readings. A single wearable heart-rate sync does not count. */
export function isCheckIn(log) {
  return readingsIn(log) >= CHECK_IN_MIN_READINGS;
}

/**
 * Check-in streak.
 * - `current`: consecutive calendar days with a full check-in, ending today. If today has no
 *   check-in yet the streak still counts up to yesterday (the day is not over).
 * - `best`: the longest run in the history.
 * - `week`: the last 7 days, oldest first, as { key, done } for a small calendar strip.
 */
export function checkInStreak(logs = [], now = Date.now()) {
  const nowMs = new Date(now).getTime();
  const days = new Set(sortLogs(logs).filter((l) => new Date(l.ts).getTime() <= nowMs && isCheckIn(l)).map((l) => dayKey(l.ts)));
  const keyAt = (offset) => dayKey(nowMs - offset * DAY_MS);

  const loggedToday = days.has(keyAt(0));
  let current = 0;
  for (let offset = loggedToday ? 0 : 1; days.has(keyAt(offset)); offset += 1) current += 1;

  let best = 0;
  let run = 0;
  let prev = null;
  for (const key of [...days].sort()) {
    const t = new Date(`${key}T12:00:00`).getTime();
    run = prev !== null && Math.round((t - prev) / DAY_MS) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    prev = t;
  }

  const week = [];
  for (let offset = 6; offset >= 0; offset -= 1) week.push({ key: keyAt(offset), done: days.has(keyAt(offset)) });
  return { current, best: Math.max(best, current), loggedToday, week, weekCount: week.filter((d) => d.done).length };
}

/**
 * Readings still to take today: any indicator not measured since midnight.
 * `overdue` when the latest value is already stale (older than the app's stale limit)
 * or missing. Overdue items come first, then in the indicator order.
 * @param snapshot  currentSnapshot() output: { [indicatorId]: { ts, stale } }
 */
export function dueToday(snapshot = {}, now = Date.now()) {
  const today = dayKey(now);
  const out = [];
  INDICATORS.forEach((m, order) => {
    const snap = snapshot[m.id];
    if (snap && dayKey(snap.ts) === today) return;
    out.push({ id: m.id, label: m.short, lastTs: snap?.ts ?? null, overdue: !snap || Boolean(snap.stale), order });
  });
  return out.sort((a, b) => Number(b.overdue) - Number(a.overdue) || a.order - b.order);
}

/**
 * Symptom notes still waiting for a recheck, soonest first.
 * `due` once the recheck time has passed. Notes marked done, or saved
 * without a recheck time, are left out.
 * @param notes  [{ id, summary, recheckAt, status }]
 */
export function openRechecks(notes = [], now = Date.now()) {
  const t = new Date(now).getTime();
  return notes
    .filter((n) => n.status !== 'done' && n.recheckAt && !Number.isNaN(new Date(n.recheckAt).getTime()))
    .map((n) => ({ ...n, due: new Date(n.recheckAt).getTime() <= t }))
    .sort((a, b) => new Date(a.recheckAt) - new Date(b.recheckAt));
}
