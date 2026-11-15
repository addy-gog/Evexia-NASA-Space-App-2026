import { describe, it, expect } from 'vitest';
import {
  classifyHeartRate,
  classifyBloodPressure,
  classifyGlucose,
  classifyTemperature,
  classifySleep,
  classifyRadiation,
  classifyCumulativeDose,
  classifySpeEventDose,
  estimateEffectiveDose,
  baselineDeviation,
  evaluateReading,
  validateReading,
  mostSevere,
  worse,
} from '../src/lib/severity.js';
import { ENVIRONMENTS, DEFAULT_BASELINE } from '../src/config/thresholds.js';

const sev = (r) => r.severity;

describe('heart rate boundaries', () => {
  it.each([
    [39, 'red'], [40, 'amber'], [49, 'amber'], [49.5, 'amber'], [50, 'green'],
    [90, 'green'], [90.5, 'amber'], [91, 'amber'], [100, 'amber'], [101, 'red'], [108, 'red'],
  ])('%s bpm → %s', (v, expected) => {
    expect(sev(classifyHeartRate(v))).toBe(expected);
  });
  it('returns value, severity and reason with source tags', () => {
    const r = classifyHeartRate(95);
    expect(r).toMatchObject({ value: 95, severity: 'amber' });
    expect(r.reason).toMatch(/above/);
    expect(r.sources.length).toBeGreaterThan(0);
  });
});

describe('blood pressure boundaries (worse of systolic and diastolic)', () => {
  it.each([
    [95, 60, 'green'], [129, 84, 'green'],
    [94, 70, 'amber'], [90, 70, 'amber'], [89, 70, 'red'],
    [130, 70, 'amber'], [139, 70, 'amber'], [140, 70, 'red'],
    [120, 85, 'amber'], [120, 89, 'amber'], [120, 90, 'red'],
    [120, 59, 'red'], [120, 60, 'green'],
  ])('%s/%s → %s', (s, d, expected) => {
    expect(sev(classifyBloodPressure(s, d))).toBe(expected);
  });
  it('systolic green, diastolic red → red', () => {
    const r = classifyBloodPressure(118, 92);
    expect(r.severity).toBe('red');
    expect(r.parts).toEqual({ sys: 'green', dia: 'red' });
  });
  it('systolic amber, diastolic green → amber', () => {
    const r = classifyBloodPressure(134, 78);
    expect(r.severity).toBe('amber');
    expect(r.parts).toEqual({ sys: 'amber', dia: 'green' });
  });
  it('systolic red, diastolic amber → red', () => {
    expect(sev(classifyBloodPressure(145, 87))).toBe('red');
  });
});

describe('glucose boundaries', () => {
  it.each([
    [59, 'red'], [60, 'amber'], [64, 'amber'], [64.5, 'amber'], [65, 'green'], [99, 'green'],
    [100, 'amber'], [125, 'amber'], [126, 'red'], [130, 'red'],
  ])('%s mg/dL → %s', (v, expected) => {
    expect(sev(classifyGlucose(v))).toBe(expected);
  });
});

describe('temperature boundaries', () => {
  it.each([
    [34.9, 'red'], [35.0, 'amber'], [35.4, 'amber'], [36.0, 'amber'], [36.1, 'green'], [37.2, 'green'],
    [37.3, 'amber'], [38.0, 'amber'], [38.1, 'red'],
  ])('%s °C → %s', (v, expected) => {
    expect(sev(classifyTemperature(v))).toBe(expected);
  });
});

describe('sleep history rules', () => {
  it('7 h is green, 6.9 h is amber, 6 h is amber', () => {
    expect(sev(classifySleep(7))).toBe('green');
    expect(sev(classifySleep(6.9))).toBe('amber');
    expect(sev(classifySleep(6))).toBe('amber');
  });
  it('one 5.5 h night is amber', () => {
    expect(sev(classifySleep(5.5, [7.5, 7.2]))).toBe('amber');
  });
  it('one 4.5 h night is red', () => {
    expect(sev(classifySleep(4.5, [7.5, 7.2]))).toBe('red');
  });
  it('exactly 5 h single night is amber (red is below 5)', () => {
    expect(sev(classifySleep(5, [7.5]))).toBe('amber');
  });
  it('two consecutive nights under 6 h becomes red', () => {
    const r = classifySleep(5.8, [7.1, 5.9]);
    expect(r.severity).toBe('red');
    expect(r.reason).toMatch(/nights in a row/);
  });
  it('short night after a good night stays amber', () => {
    expect(sev(classifySleep(5.8, [5.5, 6.5]))).toBe('amber');
  });
  it('no history: a single short night cannot be the consecutive rule', () => {
    expect(sev(classifySleep(5.8, []))).toBe('amber');
  });
});

describe('radiation: measured mGy vs mSv limits, per environment', () => {
  it('converts absorbed dose to estimated effective dose with the environment quality factor', () => {
    expect(estimateEffectiveDose(0.48, 'marsTransit')).toBeCloseTo(1.824, 3);
    expect(estimateEffectiveDose(0.48, 'station')).toBeCloseTo(0.96, 3);
    const r = classifyRadiation(0.48, 'marsTransit');
    expect(r).toMatchObject({ value: 0.48, unit: 'mGy/day', estMsv: 1.824 });
    expect(r.reason).toContain('0.48 mGy/day measured ≈ 1.824 mSv/day estimated');
  });
  it('station (Q 2.0): green below 0.8 mSv, amber to 2.0, red above', () => {
    expect(sev(classifyRadiation(0.39, 'station'))).toBe('green'); // 0.78 mSv
    expect(sev(classifyRadiation(0.4, 'station'))).toBe('amber'); // 0.80 mSv
    expect(sev(classifyRadiation(1.0, 'station'))).toBe('amber'); // 2.00 mSv
    expect(sev(classifyRadiation(1.01, 'station'))).toBe('red'); // 2.02 mSv
  });
  it('the same measured dose is green in Mars transit but amber in LEO', () => {
    expect(sev(classifyRadiation(0.48, 'marsTransit'))).toBe('green');
    expect(sev(classifyRadiation(0.48, 'station'))).toBe('amber');
  });
  it('green limit differs per environment', () => {
    expect(ENVIRONMENTS.station.radiationGreenBelowMsv).toBeLessThan(ENVIRONMENTS.marsTransit.radiationGreenBelowMsv);
    expect(sev(classifyRadiation(0.5, 'lunar'))).toBe('green'); // 1.5 mSv
    expect(sev(classifyRadiation(0.54, 'lunar'))).toBe('amber'); // 1.62 mSv
  });
  it('red above 2.0 mSv/day in every environment', () => {
    for (const env of Object.keys(ENVIRONMENTS)) expect(sev(classifyRadiation(1.2, env))).toBe('red');
  });
  it('solar particle event flag forces red', () => {
    const r = classifyRadiation(0.1, 'station', { spe: true });
    expect(r.severity).toBe('red');
    expect(r.spe).toBe(true);
    expect(r.reason).toMatch(/Solar particle event/);
  });
  it('solar particle event dose vs the 250 mSv per-event limit', () => {
    expect(sev(classifySpeEventDose(10))).toBe('green');
    expect(sev(classifySpeEventDose(50))).toBe('amber');
    expect(sev(classifySpeEventDose(200))).toBe('red');
    expect(classifySpeEventDose(125).pct).toBe(50);
  });
});

describe('cumulative dose bands (600 mSv career limit)', () => {
  it.each([
    [0, 'green'], [299, 'green'], [300, 'amber'], [480, 'amber'], [481, 'red'], [600, 'red'],
  ])('%s mSv → %s', (v, expected) => {
    expect(sev(classifyCumulativeDose(v))).toBe(expected);
  });
  it('reports percentage', () => {
    expect(classifyCumulativeDose(150).pct).toBe(25);
  });
});

describe('personal baseline mode', () => {
  const baseline = { ...DEFAULT_BASELINE, hr: 60 };
  it('deviation up to 15% is green, >15% amber, >25% red', () => {
    expect(baselineDeviation('hr', 69, 60).severity).toBe('green'); // 15%
    expect(baselineDeviation('hr', 70, 60).severity).toBe('amber'); // 16.7%
    expect(baselineDeviation('hr', 75, 60).severity).toBe('amber'); // 25%
    expect(baselineDeviation('hr', 76, 60).severity).toBe('red'); // 26.7%
    expect(baselineDeviation('hr', 44, 60).severity).toBe('red'); // -26.7%
  });
  it('baseline mode turns an absolute-green value amber when it deviates >15%', () => {
    const abs = evaluateReading({ hr: 72 });
    const base = evaluateReading({ hr: 72 }, { baselineMode: true, baseline });
    expect(abs.hr.severity).toBe('green');
    expect(base.hr.severity).toBe('amber');
    expect(base.hr.mode).toBe('baseline');
  });
  it('baseline mode can clear an absolute-amber value close to baseline (athlete)', () => {
    const athlete = { ...baseline, hr: 46 };
    expect(evaluateReading({ hr: 47 }).hr.severity).toBe('amber');
    expect(evaluateReading({ hr: 47 }, { baselineMode: true, baseline: athlete }).hr.severity).toBe('green');
  });
  it('absolute red limits still apply in baseline mode', () => {
    const high = { ...baseline, hr: 98 };
    const r = evaluateReading({ hr: 105 }, { baselineMode: true, baseline: high });
    expect(r.hr.severity).toBe('red');
    const g = evaluateReading({ glucose: 130 }, { baselineMode: true, baseline: { ...baseline, glucose: 125 } });
    expect(g.glucose.severity).toBe('red');
  });
  it('sleep counts only shortfall; temperature uses °C delta', () => {
    expect(baselineDeviation('sleep', 9.5, 7.5).severity).toBe('green');
    expect(baselineDeviation('sleep', 6.2, 7.5).severity).toBe('amber'); // -17%
    expect(baselineDeviation('temp', 37.4, 36.7).severity).toBe('amber');
    expect(baselineDeviation('temp', 37.8, 36.7).severity).toBe('red');
  });
  it('radiation is never baseline-adjusted', () => {
    const r = evaluateReading({ radiation: 0.2 }, { baselineMode: true, baseline: { ...baseline, radiation: 0.01 }, environment: 'station' });
    expect(r.radiation.severity).toBe('green');
  });
});

describe('evaluateReading and helpers', () => {
  it('skips missing indicators', () => {
    const r = evaluateReading({ hr: 70 });
    expect(Object.keys(r)).toEqual(['hr']);
  });
  it('validates impossible values', () => {
    expect(validateReading({ hr: 400 }).hr).toMatch(/between/);
    expect(validateReading({ sys: 80, dia: 90 }).dia).toMatch(/lower than systolic/);
    expect(validateReading({ hr: 70, temp: 36.8 })).toEqual({});
  });
  it('mostSevere picks highest severity, then highest weight', () => {
    const r = evaluateReading({ hr: 95, glucose: 130, temp: 37.5 });
    expect(mostSevere(r).id).toBe('glucose');
    const a = evaluateReading({ hr: 95, temp: 37.5 });
    expect(mostSevere(a).id).toBe('hr');
    expect(mostSevere(evaluateReading({ hr: 70 }))).toBeNull();
  });
  it('worse()', () => {
    expect(worse('green', 'amber')).toBe('amber');
    expect(worse('red', 'amber')).toBe('red');
  });
});
