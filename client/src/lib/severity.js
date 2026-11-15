/**
 * Pure severity classification. Every function returns
 * `{ value, severity: 'green' | 'amber' | 'red', reason, sources, mode }`.
 */
import {
  THRESHOLDS,
  BASELINE_RULES,
  ENVIRONMENTS,
  INDICATORS,
  VALID_RANGES,
} from '../config/thresholds.js';

export const SEVERITY_RANK = { green: 0, amber: 1, red: 2 };

export function worse(a, b) {
  return SEVERITY_RANK[a] >= SEVERITY_RANK[b] ? a : b;
}

export function worstOf(list) {
  return list.reduce((acc, s) => worse(acc, s), 'green');
}

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/** Generic two-band classifier for green range + amber outer range. */
function band(value, cfg) {
  const [gLo, gHi] = cfg.green;
  const [aLo, aHi] = cfg.amber;
  if (value >= gLo && value <= gHi) return { severity: 'green', side: null };
  if (value >= aLo && value <= aHi) return { severity: 'amber', side: value < gLo ? 'low' : 'high' };
  return { severity: 'red', side: value < aLo ? 'low' : 'high' };
}

function result(value, severity, reason, sources, mode = 'absolute') {
  return { value, severity, reason, sources, mode };
}

/** Blood oxygen saturation (pulse oximeter). Low side only: 100 % is the maximum. */
export function classifySpO2(spo2) {
  const cfg = THRESHOLDS.spo2;
  const { severity } = band(spo2, cfg);
  const reasons = {
    green: `${spo2}% blood oxygen is normal (${cfg.green[0]}% or more).`,
    amber: `${spo2}% blood oxygen is a little low (${cfg.amber[0]}–${cfg.green[0] - 1}%).`,
    red: `${spo2}% blood oxygen is low (under ${cfg.amber[0]}%): a breathing problem needs care now.`,
  };
  return result(spo2, severity, reasons[severity], cfg.sources);
}

export function classifyHeartRate(hr) {
  const cfg = THRESHOLDS.hr;
  const { severity, side } = band(hr, cfg);
  const reasons = {
    green: `${hr} bpm is within the resting range (${cfg.green[0]}–${cfg.green[1]} bpm).`,
    amber: side === 'low'
      ? `${hr} bpm is below the usual resting range (under ${cfg.green[0]} bpm).`
      : `${hr} bpm is above the usual resting range (over ${cfg.green[1]} bpm).`,
    red: side === 'low'
      ? `${hr} bpm is very low at rest (under ${cfg.amber[0]} bpm).`
      : `${hr} bpm is very high at rest (over ${cfg.amber[1]} bpm).`,
  };
  return result(hr, severity, reasons[severity], cfg.sources);
}

/** Blood pressure: classified by the WORSE of systolic and diastolic. */
export function classifyBloodPressure(sys, dia) {
  const s = band(sys, THRESHOLDS.sys);
  const d = band(dia, THRESHOLDS.dia);
  const severity = worse(s.severity, d.severity);
  const value = `${sys}/${dia}`;
  let reason;
  if (severity === 'green') {
    reason = `${value} mmHg is within range (95–129 / 60–84).`;
  } else {
    const parts = [];
    if (s.severity !== 'green') parts.push(`systolic ${sys} is ${s.side} (${s.severity})`);
    if (d.severity !== 'green') parts.push(`diastolic ${dia} is ${d.side} (${d.severity})`);
    reason = `${value} mmHg: ${parts.join('; ')}. The worse of the two sets the status.`;
  }
  return {
    ...result(value, severity, reason, THRESHOLDS.sys.sources),
    sys,
    dia,
    parts: { sys: s.severity, dia: d.severity },
  };
}

export function classifyGlucose(glucose) {
  const cfg = THRESHOLDS.glucose;
  const { severity, side } = band(glucose, cfg);
  const reasons = {
    green: `${glucose} mg/dL fasting is within range (65–99).`,
    amber: side === 'low'
      ? `${glucose} mg/dL is slightly low (60–64).`
      : `${glucose} mg/dL is raised (100–125).`,
    red: side === 'low'
      ? `${glucose} mg/dL is low (under 60): risk of hypoglycaemia.`
      : `${glucose} mg/dL is high (126 or more).`,
  };
  return result(glucose, severity, reasons[severity], cfg.sources);
}

export function classifyTemperature(temp) {
  const cfg = THRESHOLDS.temp;
  const { severity, side } = band(temp, cfg);
  const t = Number(temp).toFixed(1);
  const reasons = {
    green: `${t} °C is within range (36.1–37.2 °C).`,
    amber: side === 'low' ? `${t} °C is slightly low (35.0–36.0 °C).` : `${t} °C is slightly raised (37.3–38.0 °C).`,
    red: side === 'low' ? `${t} °C is hypothermia (under 35.0 °C).` : `${t} °C is a fever (over 38.0 °C).`,
  };
  return result(temp, severity, reasons[severity], cfg.sources);
}

/**
 * Sleep needs history. `previousNights` is an array of earlier nights'
 * hours, most recent LAST.
 */
export function classifySleep(hours, previousNights = []) {
  const cfg = THRESHOLDS.sleep;
  const needed = cfg.redConsecutiveNights - 1;
  const recent = previousNights.filter(isNum).slice(-needed);
  const consecutiveShort =
    hours < cfg.redConsecutiveBelow &&
    recent.length >= needed &&
    recent.every((h) => h < cfg.redConsecutiveBelow);

  let severity;
  let reason;
  if (hours < cfg.redSingleNight) {
    severity = 'red';
    reason = `${hours} h is under ${cfg.redSingleNight} h in one night.`;
  } else if (consecutiveShort) {
    severity = 'red';
    reason = `Under ${cfg.redConsecutiveBelow} h for ${cfg.redConsecutiveNights}+ nights in a row.`;
  } else if (hours < cfg.greenMin) {
    severity = 'amber';
    reason = `${hours} h is below the ${cfg.greenMin} h target.`;
  } else {
    severity = 'green';
    reason = `${hours} h meets the ${cfg.greenMin} h target.`;
  }
  return result(hours, severity, reason, cfg.sources);
}

export function radiationGreenLimit(environmentId) {
  return ENVIRONMENTS[environmentId]?.radiationGreenBelowMsv ?? ENVIRONMENTS.station.radiationGreenBelowMsv;
}

/** Measured absorbed dose (mGy) → estimated effective dose (mSv) using the environment quality factor. */
export function estimateEffectiveDose(mGy, environmentId = 'station') {
  const q = ENVIRONMENTS[environmentId]?.qualityFactor ?? ENVIRONMENTS.station.qualityFactor;
  return Number((mGy * q).toFixed(3));
}

/**
 * Radiation: the dosimeter reading is ABSORBED dose (mGy/day). Limits are EFFECTIVE dose (mSv),
 * so the reading is converted with the environment quality factor (an estimate) before comparison.
 */
export function classifyRadiation(mGyPerDay, environmentId = 'station', { spe = false } = {}) {
  const cfg = THRESHOLDS.radiation;
  const greenBelow = radiationGreenLimit(environmentId);
  const env = ENVIRONMENTS[environmentId] ?? ENVIRONMENTS.station;
  const estMsv = estimateEffectiveDose(mGyPerDay, environmentId);
  const conv = `${mGyPerDay} mGy/day measured ≈ ${estMsv} mSv/day estimated (Q ${env.qualityFactor})`;
  let severity;
  let reason;
  if (spe) {
    severity = 'red';
    reason = `Solar particle event alert: go to the storm shelter. ${conv}.`;
  } else if (estMsv > cfg.redAboveMsv) {
    severity = 'red';
    reason = `${conv}: above ${cfg.redAboveMsv} mSv/day.`;
  } else if (estMsv >= greenBelow) {
    severity = 'amber';
    reason = `${conv}: above the ${env.label} green limit (${greenBelow} mSv/day).`;
  } else {
    severity = 'green';
    reason = `${conv}: below the ${env.label} green limit (${greenBelow} mSv/day).`;
  }
  return { ...result(mGyPerDay, severity, reason, cfg.sources), spe: Boolean(spe), greenBelow, estMsv, unit: 'mGy/day' };
}

export function classifyCumulativeDose(totalMsv, careerLimit = THRESHOLDS.cumulative.careerLimit) {
  const cfg = THRESHOLDS.cumulative;
  const pct = (totalMsv / careerLimit) * 100;
  let severity = 'green';
  if (pct > cfg.redPct) severity = 'red';
  else if (pct >= cfg.amberPct) severity = 'amber';
  const reason = `${totalMsv.toFixed(1)} mSv (estimated effective dose) is ${pct.toFixed(1)}% of the ${careerLimit} mSv career limit.`;
  return { ...result(totalMsv, severity, reason, cfg.sources), pct };
}

/** Dose received during a solar particle event vs the 250 mSv per-event limit. */
export function classifySpeEventDose(totalMsv, limit = THRESHOLDS.speEvent.limit) {
  const pct = (totalMsv / limit) * 100;
  const severity = pct >= 80 ? 'red' : pct >= 20 ? 'amber' : 'green';
  const reason = `${totalMsv.toFixed(1)} mSv estimated during this solar particle event (${pct.toFixed(0)}% of the ${limit} mSv per-event limit).`;
  return { ...result(totalMsv, severity, reason, THRESHOLDS.speEvent.sources), pct };
}

/**
 * Personal baseline deviation for one field. Returns severity only from the
 * deviation rule (not the absolute rule).
 */
export function baselineDeviation(field, value, baselineValue) {
  if (!isNum(value) || !isNum(baselineValue) || baselineValue === 0) return null;
  if (field === 'temp') {
    const delta = Math.abs(value - baselineValue);
    const { amberDelta, redDelta } = BASELINE_RULES.temp;
    const severity = delta > redDelta ? 'red' : delta > amberDelta ? 'amber' : 'green';
    return { severity, delta, pct: (delta / baselineValue) * 100, unit: '°C' };
  }
  let diff = value - baselineValue;
  if (field === 'sleep') diff = Math.min(0, diff); // only shortfall counts
  const pct = (Math.abs(diff) / baselineValue) * 100;
  const severity = pct > BASELINE_RULES.redPct ? 'red' : pct > BASELINE_RULES.amberPct ? 'amber' : 'green';
  return { severity, delta: diff, pct, unit: '%' };
}

/**
 * Combine absolute and baseline results. Absolute RED always wins;
 * otherwise the baseline deviation sets the status (this lets an athlete
 * with a resting HR of 46 be green against their own baseline).
 */
function applyBaseline(absolute, fields, reading, baseline) {
  const devs = fields
    .filter((f) => BASELINE_RULES.appliesTo.includes(f))
    .map((f) => ({ f, d: baselineDeviation(f, reading[f], baseline?.[f]) }))
    .filter((x) => x.d);
  if (!devs.length) return absolute;
  if (absolute.severity === 'red') {
    return { ...absolute, mode: 'baseline', reason: `${absolute.reason} Absolute red limit applies.` };
  }
  const sev = worstOf(devs.map((x) => x.d.severity));
  const worst = devs.find((x) => x.d.severity === sev) ?? devs[0];
  const devText =
    worst.d.unit === '°C'
      ? `${Math.abs(worst.d.delta).toFixed(1)} °C`
      : `${worst.d.pct.toFixed(0)}%`;
  return {
    ...absolute,
    severity: sev,
    mode: 'baseline',
    deviation: worst.d,
    reason: `${devText} from your pre-flight baseline (${worst.f}: ${baseline[worst.f]}). Amber above ${BASELINE_RULES.amberPct}%, red above ${BASELINE_RULES.redPct}%.`,
  };
}

/**
 * Evaluate a full reading.
 *
 * @param {object} reading   { hr, sys, dia, glucose, temp, sleep, radiation, spe }
 * @param {object} ctx       { environment, sleepHistory, baselineMode, baseline }
 * @returns {object}         { [indicatorId]: result } (missing values are skipped)
 */
export function evaluateReading(reading, ctx = {}) {
  const { environment = 'station', sleepHistory = [], baselineMode = false, baseline = null } = ctx;
  const out = {};
  const useBaseline = baselineMode && baseline;
  const maybe = (abs, fields) => (useBaseline ? applyBaseline(abs, fields, reading, baseline) : abs);

  // Blood oxygen is always judged on absolute bands (a personal baseline must not make low oxygen look normal).
  if (isNum(reading.spo2)) out.spo2 = classifySpO2(reading.spo2);
  if (isNum(reading.hr)) out.hr = maybe(classifyHeartRate(reading.hr), ['hr']);
  if (isNum(reading.sys) && isNum(reading.dia)) {
    out.bp = maybe(classifyBloodPressure(reading.sys, reading.dia), ['sys', 'dia']);
  }
  if (isNum(reading.glucose)) out.glucose = maybe(classifyGlucose(reading.glucose), ['glucose']);
  if (isNum(reading.temp)) out.temp = maybe(classifyTemperature(reading.temp), ['temp']);
  if (isNum(reading.sleep)) out.sleep = maybe(classifySleep(reading.sleep, sleepHistory), ['sleep']);
  if (isNum(reading.radiation)) {
    out.radiation = classifyRadiation(reading.radiation, environment, { spe: reading.spe });
  }
  return out;
}

/** Inline validation for impossible values. Returns { field: message }. */
export function validateReading(reading) {
  const errors = {};
  for (const [field, r] of Object.entries(VALID_RANGES)) {
    const v = reading[field];
    if (v === undefined || v === null || v === '') continue;
    if (!isNum(v)) errors[field] = 'Enter a number.';
    else if (v < r.min || v > r.max) errors[field] = `Must be between ${r.min} and ${r.max}.`;
  }
  if (isNum(reading.sys) && isNum(reading.dia) && reading.dia >= reading.sys) {
    errors.dia = 'Diastolic must be lower than systolic.';
  }
  return errors;
}

export function indicatorMeta(id) {
  return INDICATORS.find((i) => i.id === id);
}

/** The most severe indicator (highest severity, then highest score weight). */
export function mostSevere(results) {
  let best = null;
  for (const meta of INDICATORS) {
    const r = results[meta.id];
    if (!r || r.severity === 'green') continue;
    if (
      !best ||
      SEVERITY_RANK[r.severity] > SEVERITY_RANK[best.result.severity] ||
      (SEVERITY_RANK[r.severity] === SEVERITY_RANK[best.result.severity] && meta.weight > best.meta.weight)
    ) {
      best = { id: meta.id, meta, result: r };
    }
  }
  return best;
}
