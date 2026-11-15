/**
 * Turns timestamped log entries into the astronaut's health status.
 *
 * A log entry: { id, crewId, ts (ISO), hr, sys, dia, glucose, temp, sleep,
 *   radiation (absorbed dose, mGy/day), spe, environment, source, device, notes }
 * Entries may hold any subset of indicators (e.g. a wearable sync with only HR).
 *
 * Current status = for each indicator, its most recent value that is not
 * stale (older than STALE_AFTER_HOURS). Pure functions; used by the client,
 * the server and the tests.
 */
import { INDICATORS, STALE_AFTER_HOURS, ENVIRONMENTS } from '../config/thresholds.js';
import {
  evaluateReading,
  classifyRadiation,
  classifyCumulativeDose,
  classifySpeEventDose,
  estimateEffectiveDose,
  SEVERITY_RANK,
} from './severity.js';
import { computeScore } from './score.js';
import { rankOf, weightOf } from './triage.js';
import { correlateHazards } from './hazards.js';

export const DAY_MS = 86_400_000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const tsOf = (log) => new Date(log.ts).getTime();

/** Oldest first; equal timestamps keep their insertion order (stable sort). */
export function sortLogs(logs = []) {
  return logs.map((l, i) => [l, i]).sort(([a, i], [b, j]) => tsOf(a) - tsOf(b) || i - j).map(([l]) => l);
}

/** Local calendar date key (YYYY-MM-DD) for grouping by day. */
export function dayKey(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function missionDayOf(ts, missionStart) {
  if (!missionStart) return null;
  const start = new Date(missionStart);
  start.setHours(0, 0, 0, 0);
  return Math.floor((new Date(ts).getTime() - start.getTime()) / DAY_MS) + 1;
}

/** Sleep from earlier calendar days (latest entry per day), most recent last. */
export function sleepHistoryBefore(logs, ts, nights = 3) {
  const day = dayKey(ts);
  const byDay = new Map();
  for (const l of sortLogs(logs)) {
    if (!isNum(l.sleep) || tsOf(l) > new Date(ts).getTime()) continue;
    const k = dayKey(l.ts);
    if (k < day) byDay.set(k, l.sleep);
  }
  return [...byDay.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).slice(-nights).map(([, v]) => v);
}

/**
 * Latest value per field at time `now`.
 * @returns {{ [field]: { value, ts, logId, source, device, environment, spe, stale } }}
 */
export function currentSnapshot(logs, now = Date.now()) {
  const snap = {};
  const nowMs = new Date(now).getTime();
  const staleMs = STALE_AFTER_HOURS * 3_600_000;
  for (const l of sortLogs(logs)) {
    if (tsOf(l) > nowMs) continue;
    const meta = { ts: l.ts, logId: l.id, source: l.source, device: l.device, environment: l.environment, stale: nowMs - tsOf(l) > staleMs };
    for (const f of ['hr', 'glucose', 'temp', 'sleep']) if (isNum(l[f])) snap[f] = { value: l[f], ...meta };
    if (isNum(l.sys) && isNum(l.dia)) snap.bp = { value: `${l.sys}/${l.dia}`, sys: l.sys, dia: l.dia, ...meta };
    if (isNum(l.radiation)) snap.radiation = { value: l.radiation, spe: Boolean(l.spe), ...meta };
  }
  return snap;
}

/** Results for one log entry (History rows). */
export function evaluateLog(log, allLogs, ctx = {}) {
  const env = log.environment || ctx.environment || 'station';
  const results = evaluateReading(
    { ...log, radiation: undefined },
    { environment: env, sleepHistory: sleepHistoryBefore(allLogs, log.ts), baselineMode: ctx.baselineMode, baseline: ctx.baseline },
  );
  if (isNum(log.radiation)) results.radiation = classifyRadiation(log.radiation, env, { spe: log.spe });
  return results;
}

/** Daily mean estimated effective dose (mSv/day) for days that have dosimeter logs. */
export function dailyDose(logs) {
  const byDay = new Map();
  for (const l of logs) {
    if (!isNum(l.radiation)) continue;
    const k = dayKey(l.ts);
    if (!byDay.has(k)) byDay.set(k, { msv: [], spe: false });
    const d = byDay.get(k);
    d.msv.push(estimateEffectiveDose(l.radiation, l.environment || 'station'));
    d.spe = d.spe || Boolean(l.spe);
  }
  return new Map([...byDay.entries()].map(([k, d]) => [k, { msv: d.msv.reduce((s, x) => s + x, 0) / d.msv.length, spe: d.spe }]));
}

/**
 * Estimated cumulative mission dose: each day from mission start to `now` uses
 * that day's mean logged rate, or carries the last known rate forward.
 */
export function estimateCumulativeDose(logs, missionStart, now = Date.now(), priorDose = 0) {
  const daily = dailyDose(logs);
  if (!missionStart) return priorDose + [...daily.values()].reduce((s, d) => s + d.msv, 0);
  const start = new Date(missionStart);
  start.setHours(0, 0, 0, 0);
  let total = priorDose;
  let last = 0;
  for (let t = start.getTime(); t <= new Date(now).getTime(); t += DAY_MS) {
    const d = daily.get(dayKey(t));
    if (d) last = d.msv;
    total += last;
  }
  return total;
}

/** Dose over the solar particle event days within the last 7 days (null if no event). */
export function speEventDose(logs, now = Date.now()) {
  const since = new Date(now).getTime() - 7 * DAY_MS;
  const recent = logs.filter((l) => tsOf(l) >= since && tsOf(l) <= new Date(now).getTime());
  const daily = dailyDose(recent);
  const speDays = [...daily.values()].filter((d) => d.spe);
  if (!speDays.length) return null;
  return classifySpeEventDose(speDays.reduce((s, d) => s + d.msv, 0));
}

/**
 * The astronaut's current status.
 * @param {Array} logs
 * @param {object} ctx { environment, delaySeconds, baselineMode, baseline, missionStart, lastConference, priorDose }
 */
export function evaluateCurrent(logs = [], ctx = {}, now = Date.now()) {
  const snapshot = currentSnapshot(logs, now);
  const fresh = (k) => snapshot[k] && !snapshot[k].stale;
  const reading = {};
  if (fresh('hr')) reading.hr = snapshot.hr.value;
  if (fresh('bp')) Object.assign(reading, { sys: snapshot.bp.sys, dia: snapshot.bp.dia });
  for (const f of ['glucose', 'temp', 'sleep']) if (fresh(f)) reading[f] = snapshot[f].value;

  const results = evaluateReading(reading, {
    environment: ctx.environment,
    sleepHistory: fresh('sleep') ? sleepHistoryBefore(logs, snapshot.sleep.ts) : [],
    baselineMode: ctx.baselineMode,
    baseline: ctx.baseline,
  });
  if (fresh('radiation')) {
    const r = snapshot.radiation;
    results.radiation = classifyRadiation(r.value, r.environment || ctx.environment || 'station', { spe: r.spe });
    reading.radiation = r.value;
    reading.spe = r.spe;
  }
  for (const [k, r] of Object.entries(results)) r.ts = snapshot[k]?.ts;

  const cumulative = classifyCumulativeDose(estimateCumulativeDose(logs, ctx.missionStart, now, ctx.priorDose || 0));
  const spe = speEventDose(logs, now);
  const daysSinceContact = ctx.lastConference ? Math.max(0, Math.floor((new Date(now) - new Date(ctx.lastConference)) / DAY_MS)) : 0;
  const score = computeScore(results);
  const hazards = correlateHazards(results, { daysSinceContact, delaySeconds: ctx.delaySeconds || 0, cumulative });
  const alerts = INDICATORS.filter((m) => results[m.id] && results[m.id].severity !== 'green')
    .map((m) => ({ id: m.id, meta: m, result: results[m.id] }))
    // IITT colour first, then the ABCDE primary survey (airway/breathing, circulation, disability, exposure, behaviour).
    .sort((a, b) => SEVERITY_RANK[b.result.severity] - SEVERITY_RANK[a.result.severity] || (rankOf(a.id)?.rank ?? 9) - (rankOf(b.id)?.rank ?? 9) || weightOf(b.id) - weightOf(a.id));
  const latest = sortLogs(logs).filter((l) => tsOf(l) <= new Date(now).getTime()).at(-1) ?? null;

  return {
    now: new Date(now).toISOString(),
    missionDay: missionDayOf(now, ctx.missionStart),
    reading,
    snapshot,
    results,
    score,
    hazards,
    cumulative,
    spe,
    alerts,
    daysSinceContact,
    latestLog: latest,
    hasData: Object.keys(snapshot).length > 0,
  };
}

/** Daily health score from `from` to `to` (end of each day), for History. */
export function dailyScoreSeries(logs, ctx, from, to = Date.now()) {
  const out = [];
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  for (let t = start.getTime(); t <= new Date(to).getTime(); t += DAY_MS) {
    const end = Math.min(t + DAY_MS - 1, new Date(to).getTime());
    const s = evaluateCurrent(logs, ctx, end);
    out.push({ day: dayKey(t), t, score: s.score.score, band: s.score.band?.label ?? null });
  }
  return out;
}

/** Per-week summary (weeks start on Monday). */
export function weeklySummary(logs, ctx) {
  const weeks = new Map();
  const sorted = sortLogs(logs);
  for (const l of sorted) {
    const d = new Date(l.ts);
    const monday = new Date(d);
    monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const k = dayKey(monday);
    if (!weeks.has(k)) weeks.set(k, { weekOf: k, logs: 0, amber: 0, red: 0, vals: { hr: [], sys: [], dia: [], glucose: [], temp: [], sleep: [], radiation: [] } });
    const w = weeks.get(k);
    w.logs += 1;
    for (const f of Object.keys(w.vals)) if (isNum(l[f])) w.vals[f].push(l[f]);
    const res = evaluateLog(l, sorted, ctx);
    for (const r of Object.values(res)) {
      if (r.severity === 'amber') w.amber += 1;
      if (r.severity === 'red') w.red += 1;
    }
  }
  const avg = (a, dp = 0) => (a.length ? Number((a.reduce((s, x) => s + x, 0) / a.length).toFixed(dp)) : null);
  return [...weeks.values()]
    .sort((a, b) => (a.weekOf < b.weekOf ? 1 : -1))
    .map((w) => ({
      weekOf: w.weekOf,
      logs: w.logs,
      amber: w.amber,
      red: w.red,
      hr: avg(w.vals.hr),
      sys: avg(w.vals.sys),
      dia: avg(w.vals.dia),
      glucose: avg(w.vals.glucose),
      temp: avg(w.vals.temp, 1),
      sleep: avg(w.vals.sleep, 1),
      radiation: avg(w.vals.radiation, 3),
    }));
}

export function environmentLabel(id) {
  return ENVIRONMENTS[id]?.label ?? id;
}
