import { describe, it, expect } from 'vitest';
import { checkInStreak, dueToday, isCheckIn, openRechecks, readingsIn } from '../src/lib/routine.js';

// Local noon on a fixed day, so day boundaries do not depend on the test machine's time of day.
const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime();
const at = (daysAgo, hour = 7) => new Date(2026, 10, 15 - daysAgo, hour, 0, 0).toISOString();
const full = (daysAgo, hour) => ({ ts: at(daysAgo, hour), spo2: 98, hr: 64, sys: 115, dia: 73, glucose: 90, temp: 36.8, sleep: 7.5, radiation: 0.48 });
const hrOnly = (daysAgo) => ({ ts: at(daysAgo, 21), hr: 66 });

describe('check-in definition', () => {
  it('counts readings, with blood pressure needing both numbers', () => {
    expect(readingsIn(full(0))).toBe(7);
    expect(readingsIn({ ts: at(0), sys: 120 })).toBe(0);
    expect(readingsIn({ ts: at(0), hr: 60, sys: 120, dia: 80 })).toBe(2);
  });
  it('a full check-in needs at least four of six readings; a wearable heart-rate sync is not one', () => {
    expect(isCheckIn(full(0))).toBe(true);
    expect(isCheckIn(hrOnly(0))).toBe(false);
    expect(isCheckIn({ ts: at(0), hr: 60, glucose: 90, temp: 36.6, sleep: 7 })).toBe(true);
    expect(isCheckIn({ ts: at(0), hr: 60, glucose: 90, temp: 36.6 })).toBe(false);
  });
});

describe('checkInStreak', () => {
  it('no logs → zero streak, empty week', () => {
    const s = checkInStreak([], NOW);
    expect(s).toMatchObject({ current: 0, best: 0, loggedToday: false, weekCount: 0 });
    expect(s.week).toHaveLength(7);
  });
  it('counts consecutive days ending today', () => {
    const s = checkInStreak([full(0), full(1), full(2), full(4)], NOW);
    expect(s).toMatchObject({ current: 3, loggedToday: true, weekCount: 4 });
  });
  it('before today\'s check-in, the streak still runs up to yesterday', () => {
    const s = checkInStreak([full(1), full(2), full(3)], NOW);
    expect(s).toMatchObject({ current: 3, loggedToday: false });
  });
  it('a missed day breaks the streak', () => {
    expect(checkInStreak([full(0), full(2), full(3)], NOW).current).toBe(1);
    expect(checkInStreak([full(2), full(3)], NOW).current).toBe(0);
  });
  it('wearable-only days do not count, and several entries in one day count once', () => {
    const s = checkInStreak([full(0, 7), full(0, 19), hrOnly(1), full(2)], NOW);
    expect(s.current).toBe(1);
    expect(s.weekCount).toBe(2);
  });
  it('best is the longest run anywhere in the history', () => {
    const logs = [full(0), ...[10, 11, 12, 13, 14].map((d) => full(d))];
    expect(checkInStreak(logs, NOW)).toMatchObject({ current: 1, best: 5 });
  });
  it('ignores entries in the future', () => {
    expect(checkInStreak([{ ...full(0), ts: new Date(NOW + 3_600_000).toISOString() }], NOW).current).toBe(0);
  });
  it('the week strip runs oldest to newest and ends today', () => {
    const s = checkInStreak([full(0), full(6)], NOW);
    expect(s.week[0].done).toBe(true);
    expect(s.week[6].done).toBe(true);
    expect(s.week.slice(1, 6).every((d) => !d.done)).toBe(true);
  });
});

describe('dueToday', () => {
  const snap = (daysAgo, stale = false) => ({ ts: at(daysAgo), stale });
  it('nothing due when every reading was taken today', () => {
    const s = { spo2: snap(0), hr: snap(0), bp: snap(0), glucose: snap(0), temp: snap(0), sleep: snap(0), radiation: snap(0) };
    expect(dueToday(s, NOW)).toEqual([]);
  });
  it('lists readings not taken today, overdue (stale or never taken) first', () => {
    const s = { hr: snap(0), bp: snap(1), glucose: snap(3, true), temp: snap(0), sleep: snap(1) };
    const due = dueToday(s, NOW);
    // Overdue first, then in ABCDE / catalogue order (blood oxygen leads).
    expect(due.map((d) => d.id)).toEqual(['spo2', 'glucose', 'radiation', 'bp', 'sleep']);
    expect(due.find((d) => d.id === 'radiation')).toMatchObject({ overdue: true, lastTs: null });
    expect(due.find((d) => d.id === 'bp')).toMatchObject({ overdue: false, label: 'Blood pressure' });
  });
  it('an empty snapshot makes all seven readings overdue', () => {
    const due = dueToday({}, NOW);
    expect(due).toHaveLength(7);
    expect(due.every((d) => d.overdue)).toBe(true);
  });
});

describe('openRechecks', () => {
  const inHours = (h) => new Date(NOW + h * 3_600_000).toISOString();
  it('lists open notes with a recheck time, soonest first, and marks the ones that are due', () => {
    const notes = [
      { id: 'later', summary: 'b', recheckAt: inHours(3), status: 'open' },
      { id: 'past', summary: 'a', recheckAt: inHours(-1), status: 'open' },
      { id: 'closed', summary: 'c', recheckAt: inHours(-2), status: 'done' },
      { id: 'none', summary: 'd', recheckAt: null, status: 'open' },
    ];
    expect(openRechecks(notes, NOW).map((n) => [n.id, n.due])).toEqual([['past', true], ['later', false]]);
  });
  it('handles no notes', () => {
    expect(openRechecks(undefined, NOW)).toEqual([]);
  });
});
