import { describe, it, expect } from 'vitest';
import {
  currentSnapshot,
  evaluateCurrent,
  evaluateLog,
  sleepHistoryBefore,
  estimateCumulativeDose,
  speEventDose,
  dailyScoreSeries,
  weeklySummary,
  missionDayOf,
  dayKey,
  DAY_MS,
} from '../src/lib/evaluate.js';

const NOW = new Date('2026-11-14T12:00:00').getTime();
const at = (daysAgo, hh = 7, mm = 0) => {
  const d = new Date(NOW - daysAgo * DAY_MS);
  d.setHours(hh, mm, 0, 0);
  return d.toISOString();
};
const log = (id, daysAgo, values, extra = {}) => ({ id, crewId: 'c1', ts: at(daysAgo, extra.hh ?? 7), environment: 'marsTransit', source: 'manual', notes: '', ...values, ...extra });
const ctx = { environment: 'marsTransit', delaySeconds: 720, missionStart: '2026-09-15', lastConference: '2026-10-27' };

describe('timestamps and mission day', () => {
  it('mission day counts from the mission start date (day 1 = start)', () => {
    expect(missionDayOf('2026-09-15T08:00:00', '2026-09-15')).toBe(1);
    expect(missionDayOf('2026-09-16T23:00:00', '2026-09-15')).toBe(2);
    expect(missionDayOf(NOW, null)).toBeNull();
  });
  it('dayKey groups by local calendar day', () => {
    expect(dayKey('2026-11-14T07:00:00')).toBe('2026-11-14');
  });
});

describe('current snapshot from timestamped logs', () => {
  const logs = [
    log('a', 2, { hr: 70, sys: 118, dia: 76, glucose: 90, temp: 36.7, sleep: 7.5, radiation: 0.48 }),
    log('b', 1, { hr: 96 }, { source: 'wearable', device: 'Polar H10' }),
    log('c', 0.2, { glucose: 130 }),
  ];
  it('takes the most recent value per indicator, with its time and source', () => {
    const s = currentSnapshot(logs, NOW);
    expect(s.hr).toMatchObject({ value: 96, logId: 'b', source: 'wearable', device: 'Polar H10' });
    expect(s.glucose.value).toBe(130);
    expect(s.bp).toMatchObject({ value: '118/76', sys: 118, dia: 76 });
    expect(s.radiation.value).toBe(0.48);
  });
  it('ignores logs after "now"', () => {
    expect(currentSnapshot(logs, NOW - 1.5 * DAY_MS).hr.value).toBe(70);
  });
  it('marks values older than 36 h stale and leaves them out of the evaluation', () => {
    const s = evaluateCurrent(logs, ctx, NOW);
    expect(s.snapshot.temp.stale).toBe(true);
    expect(s.results.temp).toBeUndefined();
    expect(s.results.hr.severity).toBe('amber');
    expect(s.results.glucose.severity).toBe('red');
    expect(s.score.score).toBeLessThanOrEqual(59);
    expect(s.results.hr.ts).toBe(logs[1].ts);
  });
  it('empty log list → no data', () => {
    const s = evaluateCurrent([], ctx, NOW);
    expect(s.hasData).toBe(false);
    expect(s.score.score).toBeNull();
  });
});

describe('sleep history across days', () => {
  it('uses the latest sleep value of each earlier day', () => {
    const logs = [log('1', 3, { sleep: 7.5 }), log('2', 2, { sleep: 5.9 }), log('2b', 2, { sleep: 5.8 }, { hh: 9 }), log('3', 1, { sleep: 6.5 })];
    expect(sleepHistoryBefore(logs, at(0))).toEqual([7.5, 5.8, 6.5]);
  });
  it('two consecutive nights under 6 h make the current sleep red', () => {
    const logs = [log('1', 1, { sleep: 5.8 }), log('2', 0.1, { sleep: 5.7 }, { hh: 7 })];
    expect(evaluateCurrent(logs, ctx, NOW).results.sleep.severity).toBe('red');
    expect(evaluateLog(logs[1], logs, ctx).sleep.severity).toBe('red');
    expect(evaluateLog(logs[0], logs, ctx).sleep.severity).toBe('amber');
  });
});

describe('radiation dose estimates', () => {
  it('cumulative dose carries the last logged rate forward from the mission start', () => {
    const logs = [log('1', 3, { radiation: 0.5 }), log('2', 1, { radiation: 0.5 })];
    const start = new Date(NOW - 3 * DAY_MS).toISOString().slice(0, 10);
    // 4 calendar days (3 days ago … today) × 0.5 mGy × Q 3.8 = 7.6 mSv
    expect(estimateCumulativeDose(logs, start, NOW)).toBeCloseTo(7.6, 5);
    expect(estimateCumulativeDose(logs, start, NOW, 100)).toBeCloseTo(107.6, 5);
  });
  it('solar particle event dose sums SPE days in the last week', () => {
    const logs = [log('1', 5, { radiation: 3.2 }, { spe: true }), log('2', 4, { radiation: 0.48 })];
    const spe = speEventDose(logs, NOW);
    expect(spe.value).toBeCloseTo(12.16, 2);
    expect(spe.severity).toBe('green');
    expect(speEventDose([log('x', 2, { radiation: 0.4 })], NOW)).toBeNull();
  });
  it('isolation insight uses days since the last conference', () => {
    const logs = [log('1', 0.1, { hr: 95, sleep: 6.3 })];
    const s = evaluateCurrent(logs, ctx, NOW);
    expect(s.daysSinceContact).toBe(18);
    expect(s.hazards.map((h) => h.id)).toContain('behavioural-health');
  });
});

describe('history series and weekly summary', () => {
  const logs = [];
  for (let d = 13; d >= 0; d -= 1) logs.push(log(`d${d}`, d + 0.01, { hr: d < 5 ? 95 : 65, sys: 118, dia: 76, glucose: 90, temp: 36.7, sleep: 7.4, radiation: 0.48 }));
  it('daily score series covers each day with the score at its end', () => {
    const series = dailyScoreSeries(logs, ctx, NOW - 6 * DAY_MS, NOW);
    expect(series).toHaveLength(7);
    // All green: 85–100 depending on how centred each reading is (IITT/ABCDE scoring, lib/triage.js).
    expect(series[0].score).toBeGreaterThanOrEqual(85);
    expect(series[0].band).toBe('Mission ready');
    // Heart rate amber only: circulation (ABCDE C) amber ceiling is 76.
    expect(series.at(-1).score).toBeLessThanOrEqual(76);
    expect(series.at(-1).band).toBe('Monitor closely');
  });
  it('weekly summary groups by week (newest first) with averages and alert counts', () => {
    const weeks = weeklySummary(logs, ctx);
    expect(weeks.length).toBeGreaterThanOrEqual(2);
    expect(weeks[0].weekOf > weeks[1].weekOf).toBe(true);
    const total = weeks.reduce((s, w) => s + w.logs, 0);
    expect(total).toBe(14);
    expect(weeks.reduce((s, w) => s + w.amber, 0)).toBe(5);
    expect(weeks.at(-1).hr).toBe(65);
  });
});
