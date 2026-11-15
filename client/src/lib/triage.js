/**
 * Clinical prioritisation and the overall health % (IITT + ABCDE). Pure and unit tested.
 *
 * 1. Score each reading 0–100 by how deep it sits in its zone:
 *    green 85–100 (100 at the centre of the green range), amber 79→50, red 39→0.
 * 2. Weighted average with the ABCDE clinical weights (renormalised over the readings present).
 * 3. Minus interaction penalties: 3 per extra amber flag, 7 per extra red flag.
 * 4. Capped by the most urgent active flag: colour tier first (red before amber), then ABCDE rank.
 *
 * The flight surgeon queue sorts by the triage priority score:
 *   tier weight (red 1000, amber 500, green 100) + ABCDE rank score of the top flag (50…10) + 5 per flag.
 */
import { INDICATORS, THRESHOLDS, TRIAGE } from '../config/thresholds.js';

const SEV_ORDER = { red: 2, amber: 1, green: 0 };
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const frac = (dist, width) => (width > 0 ? clamp(dist / width, 0, 1) : 1);

/** ABCDE rank entry for an indicator id (undefined if the id is not ranked). */
export function rankOf(id) {
  return TRIAGE.ranks.find((r) => id in r.weights);
}

/** Clinical weight (%) of an indicator. */
export function weightOf(id) {
  return rankOf(id)?.weights[id] ?? 0;
}

/** Ceiling cap for one active flag. */
export function capFor(id, severity) {
  const r = rankOf(id);
  if (!r || severity === 'green') return 100;
  return severity === 'red' ? r.redCap : r.amberCap;
}

const [G_LO, G_HI] = TRIAGE.zone.green;
const [A_LO, A_HI] = TRIAGE.zone.amber;
const R_HI = TRIAGE.zone.red[1];
const greenScore = (f) => G_HI - (G_HI - G_LO) * f; // f = 0 at optimum → 100, f = 1 at the green edge → 85
const amberScore = (f) => A_HI - (A_HI - A_LO) * f; // 79 just past green → 50 at the red edge
const redScore = (f) => Math.max(0, R_HI - R_HI * f); // 39 just past amber → 0 at the critical limit

/** Two-sided band (green range inside an amber outer range). Returns { zone, score }. */
export function twoSidedScore(x, green, amber, critical) {
  const [gLo, gHi] = green;
  const [aLo, aHi] = amber;
  if (x >= gLo && x <= gHi) {
    const centre = (gLo + gHi) / 2;
    return { zone: 'green', score: greenScore(frac(Math.abs(x - centre), (gHi - gLo) / 2)) };
  }
  if (x >= aLo && x <= aHi) {
    const low = x < gLo;
    return { zone: 'amber', score: amberScore(low ? frac(gLo - x, gLo - aLo) : frac(x - gHi, aHi - gHi)) };
  }
  const low = x < aLo;
  return { zone: 'red', score: redScore(low ? frac(aLo - x, aLo - critical[0]) : frac(x - aHi, critical[1] - aHi)) };
}

/** Sleep: more is better up to the optimum. Green ≥ 7 h, amber 5–7 h, red < 5 h. */
export function sleepScore(h) {
  const { greenMin, redSingleNight } = THRESHOLDS.sleep;
  if (h >= greenMin) return { zone: 'green', score: greenScore(1 - frac(h - greenMin, TRIAGE.sleepOptimal - greenMin)) };
  if (h >= redSingleNight) return { zone: 'amber', score: amberScore(frac(greenMin - h, greenMin - redSingleNight)) };
  return { zone: 'red', score: redScore(frac(redSingleNight - h, redSingleNight - TRIAGE.critical.sleepHours)) };
}

/** Radiation on the estimated effective dose (mSv/day): 0 is optimal, red above 2.0 mSv/day. */
export function radiationScore(msv, greenBelow) {
  const red = THRESHOLDS.radiation.redAboveMsv;
  if (msv < greenBelow) return { zone: 'green', score: greenScore(frac(msv, greenBelow)) };
  if (msv <= red) return { zone: 'amber', score: amberScore(frac(msv - greenBelow, red - greenBelow)) };
  return { zone: 'red', score: redScore(frac(msv - red, TRIAGE.critical.radiationMsv - red)) };
}

/**
 * Score one indicator result (0–100). The colour always comes from the classifier (`result.severity`);
 * when the zone maths disagrees (personal baseline mode, two short nights in a row, a solar particle
 * event alert) the score sits at the top of the classified colour's range.
 */
export function indicatorScore(id, result) {
  const sev = result?.severity;
  if (!sev) return null;
  const c = TRIAGE.critical;
  let z = null;
  if (id === 'hr' && isNum(result.value)) z = twoSidedScore(result.value, THRESHOLDS.hr.green, THRESHOLDS.hr.amber, c.hr);
  else if (id === 'bp' && isNum(result.sys) && isNum(result.dia)) {
    const s = twoSidedScore(result.sys, THRESHOLDS.sys.green, THRESHOLDS.sys.amber, c.sys);
    const d = twoSidedScore(result.dia, THRESHOLDS.dia.green, THRESHOLDS.dia.amber, c.dia);
    z = s.score <= d.score ? s : d; // the worse of the two, as the classifier does
  } else if (id === 'glucose' && isNum(result.value)) z = twoSidedScore(result.value, THRESHOLDS.glucose.green, THRESHOLDS.glucose.amber, c.glucose);
  else if (id === 'temp' && isNum(result.value)) z = twoSidedScore(result.value, THRESHOLDS.temp.green, THRESHOLDS.temp.amber, c.temp);
  else if (id === 'sleep' && isNum(result.value)) z = sleepScore(result.value);
  else if (id === 'radiation' && isNum(result.estMsv) && isNum(result.greenBelow)) z = radiationScore(result.estMsv, result.greenBelow);

  if (z && z.zone === sev) return Math.round(z.score * 10) / 10;
  return { green: G_LO, amber: A_HI, red: R_HI }[sev];
}

/** Active flags (non-green), most urgent first: colour tier, then ABCDE rank, then clinical weight. */
export function activeFlags(results) {
  return INDICATORS.map(({ id }) => ({ id, severity: results?.[id]?.severity, rank: rankOf(id) }))
    .filter((f) => f.severity && f.severity !== 'green' && f.rank)
    .sort((a, b) => SEV_ORDER[b.severity] - SEV_ORDER[a.severity] || a.rank.rank - b.rank.rank || weightOf(b.id) - weightOf(a.id));
}

/**
 * Triage priority for the flight surgeon queue (higher = see first).
 * @returns {{ tier: 'red'|'amber'|'green'|null, top: object|null, flags: object[], priority: number }}
 */
export function triageOf(results) {
  const present = INDICATORS.some(({ id }) => results?.[id]?.severity);
  if (!present) return { tier: null, top: null, flags: [], priority: 0 };
  const flags = activeFlags(results);
  const top = flags[0] ?? null;
  const tier = top ? top.severity : 'green';
  const priority = TRIAGE.tiers[tier].weight + (top ? top.rank.rankScore : 0) + flags.length * TRIAGE.flagCountWeight;
  return { tier, top, flags, priority };
}

/**
 * Overall health % with the IITT/ABCDE ceiling.
 * @param {object} results  { [indicatorId]: classifier result }; missing ids are skipped
 */
export function computeHealth(results) {
  let weighted = 0;
  let total = 0;
  const parts = {};
  for (const { id } of INDICATORS) {
    const s = indicatorScore(id, results?.[id]);
    if (s == null) continue;
    const w = weightOf(id);
    parts[id] = s;
    weighted += s * w;
    total += w;
  }
  const triage = triageOf(results);
  if (total === 0) return { score: null, raw: null, penalty: 0, cap: null, capped: false, counted: 0, parts, triage };

  const raw = weighted / total;
  const ambers = triage.flags.filter((f) => f.severity === 'amber').length;
  const reds = triage.flags.filter((f) => f.severity === 'red').length;
  const penalty = Math.max(0, ambers - 1) * TRIAGE.penalty.amber + Math.max(0, reds - 1) * TRIAGE.penalty.red;
  const adjusted = raw - penalty;
  const cap = triage.top ? capFor(triage.top.id, triage.top.severity) : null;
  const final = clamp(Math.round(cap == null ? adjusted : Math.min(adjusted, cap)), 0, 100);
  return {
    score: final,
    raw: Math.round(raw * 10) / 10,
    penalty,
    cap,
    capped: cap != null && adjusted > cap,
    counted: Object.keys(parts).length,
    parts,
    triage,
  };
}

/** Plain-language reason for the ceiling, e.g. "Capped at 45 %: circulation (ABCDE C) is red." */
export function capReason(health) {
  const top = health?.triage?.top;
  if (!health?.capped || !top) return null;
  return `Capped at ${health.cap}%: ${top.rank.label.toLowerCase()} (ABCDE ${top.rank.letter}) is ${top.severity === 'red' ? 'red, emergent' : 'amber, urgent'}.`;
}
