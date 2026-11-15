import { describe, it, expect } from 'vitest';
import { computeScore } from '../src/lib/score.js';
import { computeHealth, triageOf, indicatorScore, twoSidedScore, rankOf, capFor } from '../src/lib/triage.js';
import { evaluateReading } from '../src/lib/severity.js';
import { TRIAGE } from '../src/config/thresholds.js';

// Every reading at the centre of its green range (or optimal): each indicator scores 100.
const OPTIMAL = { spo2: 99, hr: 70, sys: 112, dia: 72, glucose: 82, temp: 36.65, sleep: 8, radiation: 0 };
const health = (over = {}, ctx = {}) => computeHealth(evaluateReading({ ...OPTIMAL, ...over }, ctx));

describe('IITT / ABCDE configuration', () => {
  it('clinical weights sum to 100 across the five ABCDE ranks', () => {
    const sum = TRIAGE.ranks.reduce((s, r) => s + Object.values(r.weights).reduce((a, b) => a + b, 0), 0);
    expect(sum).toBe(100);
  });
  it('maps Evexia readings to ABCDE ranks', () => {
    expect(rankOf('spo2').rank).toBe(1);
    expect(rankOf('spo2').letter).toBe('A/B');
    expect(rankOf('hr').rank).toBe(2);
    expect(rankOf('bp').rank).toBe(2);
    expect(rankOf('glucose').rank).toBe(3);
    expect(rankOf('temp').rank).toBe(4);
    expect(rankOf('radiation').rank).toBe(4);
    expect(rankOf('sleep').rank).toBe(5);
  });
  it('caps tighten with ABCDE priority, and every red cap is below every amber cap', () => {
    const amber = TRIAGE.ranks.map((r) => r.amberCap);
    const red = TRIAGE.ranks.map((r) => r.redCap);
    expect(amber).toEqual([72, 76, 80, 82, 84]);
    expect(red).toEqual([39, 45, 50, 55, 59]);
    expect(Math.max(...red)).toBeLessThan(Math.min(...amber));
    expect(capFor('hr', 'red')).toBe(45);
    expect(capFor('sleep', 'amber')).toBe(84);
    expect(capFor('hr', 'green')).toBe(100);
  });
});

describe('Step 1: per-reading score by depth in its zone', () => {
  const hr = (x) => twoSidedScore(x, [50, 90], [40, 100], [30, 150]);
  it('green: 100 at the centre, 85 at the edge', () => {
    expect(hr(70)).toEqual({ zone: 'green', score: 100 });
    expect(hr(90).score).toBe(85);
    expect(hr(50).score).toBe(85);
  });
  it('amber: 79 just past green, 50 at the red edge', () => {
    expect(hr(90.0001).zone).toBe('amber');
    expect(hr(90.0001).score).toBeCloseTo(79, 2);
    expect(hr(100).score).toBe(50);
    expect(hr(45).score).toBeCloseTo(64.5, 5);
  });
  it('red: 39 just past amber, 0 at or beyond the critical limit', () => {
    expect(hr(100.0001).zone).toBe('red');
    expect(hr(100.0001).score).toBeCloseTo(39, 2);
    expect(hr(150).score).toBe(0);
    expect(hr(220).score).toBe(0);
    expect(hr(30).score).toBe(0);
  });
  it('blood pressure uses the worse of systolic and diastolic', () => {
    const r = evaluateReading({ sys: 112, dia: 87 }).bp; // diastolic amber
    expect(r.severity).toBe('amber');
    expect(indicatorScore('bp', r)).toBeCloseTo(79 - 29 * (3 / 5), 1);
  });
  it('when the classifier disagrees with the zone (two short nights) the score sits at the top of its colour', () => {
    const r = evaluateReading({ sleep: 5.8 }, { sleepHistory: [5.5] }).sleep;
    expect(r.severity).toBe('red');
    expect(indicatorScore('sleep', r)).toBe(39);
  });
});

describe('blood oxygen (ABCDE A/B)', () => {
  it('classifies 95 %+ green, 90–94 % amber, under 90 % red', () => {
    expect(evaluateReading({ spo2: 98 }).spo2.severity).toBe('green');
    expect(evaluateReading({ spo2: 95 }).spo2.severity).toBe('green');
    expect(evaluateReading({ spo2: 94 }).spo2.severity).toBe('amber');
    expect(evaluateReading({ spo2: 90 }).spo2.severity).toBe('amber');
    expect(evaluateReading({ spo2: 89 }).spo2.severity).toBe('red');
  });
  it('scores 100 at 98 %+, 85 at 95 %, 79→50 across amber, 39→0 down to 80 %', () => {
    const s = (x) => indicatorScore('spo2', evaluateReading({ spo2: x }).spo2);
    expect(s(99)).toBe(100);
    expect(s(95)).toBe(85);
    expect(s(92)).toBeCloseTo(61.6, 1);
    expect(s(88)).toBeCloseTo(31.2, 1);
    expect(s(80)).toBe(0);
  });
  it('a personal baseline never makes low oxygen look normal', () => {
    const r = evaluateReading({ spo2: 88, hr: 70 }, { baselineMode: true, baseline: { hr: 70 } });
    expect(r.spo2.severity).toBe('red');
  });
  it('guide case 4, airway/breathing amber (SpO2 92 %) → capped at 72', () => {
    const h = health({ spo2: 92 });
    expect(h.triage.top.id).toBe('spo2');
    expect(h.score).toBe(72);
  });
  it('guide case 7, airway/breathing red (SpO2 88 %) → capped at 39', () => {
    expect(health({ spo2: 88 }).score).toBe(39);
  });
  it('guide case 8, SpO2 87 % + heart rate 134: breathing sets the cap, 7-point multi-red penalty, top of the queue', () => {
    const h = health({ spo2: 87, hr: 134 });
    expect(h.triage.top.id).toBe('spo2');
    expect(h.cap).toBe(39);
    expect(h.penalty).toBe(7);
    expect(h.score).toBeLessThanOrEqual(39);
    expect(h.triage.priority).toBe(1000 + 50 + 10);
  });
  it('all eight guide cases come out in order of urgency', () => {
    const cases = [{}, { sleep: 5.5 }, { hr: 96 }, { spo2: 92 }, { temp: 38.2 }, { hr: 128 }, { spo2: 88 }, { spo2: 87, hr: 134 }];
    const scores = cases.map((o) => health(o).score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    const prios = cases.map((o) => health(o).triage.priority);
    expect(prios).toEqual([...prios].sort((a, b) => a - b));
  });
});

describe('Steps 2–4: weighted average, penalties and the triage ceiling', () => {
  it('all optimal → 100, green, no cap', () => {
    const h = health();
    expect(h.score).toBe(100);
    expect(h.cap).toBeNull();
    expect(h.triage.tier).toBe('green');
    expect(computeScore(evaluateReading(OPTIMAL)).band.label).toBe('Mission ready');
  });
  it('green readings stay in the 85–100 band', () => {
    const h = health({ hr: 89, glucose: 98, temp: 37.1, sleep: 7 });
    expect(h.triage.tier).toBe('green');
    expect(h.score).toBeGreaterThanOrEqual(85);
    expect(h.score).toBeLessThanOrEqual(100);
  });
  it('guide case 2, behavioural amber (sleep 5.5 h) → capped at 84', () => {
    const h = health({ sleep: 5.5 });
    expect(h.triage.top.id).toBe('sleep');
    expect(h.score).toBe(84);
    expect(h.capped).toBe(true);
  });
  it('guide case 3, circulation amber (HR 96) → capped at 76', () => {
    expect(health({ hr: 96 }).score).toBe(76);
  });
  it('guide case 5, exposure red (fever 38.2 °C) → capped at 55', () => {
    const h = health({ temp: 38.2 });
    expect(h.score).toBe(55);
    expect(computeScore(evaluateReading({ ...OPTIMAL, temp: 38.2 })).band.label).toBe('Act now');
  });
  it('guide case 6, circulation red (HR 128) → capped at 45', () => {
    expect(health({ hr: 128 }).score).toBe(45);
  });
  it('the percentage alone orders the cases by urgency', () => {
    const scores = [{}, { sleep: 5.5 }, { hr: 96 }, { temp: 38.2 }, { hr: 128 }].map((o) => health(o).score);
    expect(scores).toEqual([...scores].sort((a, b) => b - a));
    expect(new Set(scores).size).toBe(scores.length);
  });
  it('the most urgent flag sets the cap: red fever (rank 4) + red heart rate (rank 2) → circulation cap 45', () => {
    const h = health({ temp: 38.6, hr: 134 });
    expect(h.triage.top.id).toBe('hr');
    expect(h.cap).toBe(45);
    expect(h.penalty).toBe(7);
    expect(h.score).toBeLessThanOrEqual(45);
  });
  it('red beats amber whatever the rank: amber heart rate + red sleep → tier red, sleep cap 59', () => {
    const h = health({ hr: 95, sleep: 4 });
    expect(h.triage.tier).toBe('red');
    expect(h.triage.top.id).toBe('sleep');
    expect(h.cap).toBe(59);
  });
  it('interaction penalties: 3 per extra amber, 7 per extra red', () => {
    expect(health({ hr: 95, glucose: 110, temp: 37.6 }).penalty).toBe(6);
    expect(health({ hr: 130, glucose: 300, temp: 39.5, sleep: 3 }).penalty).toBe(21);
    const h = health({ hr: 130, glucose: 300, temp: 39.5, sleep: 3 });
    expect(h.score).toBe(Math.round(Math.min(h.raw - h.penalty, h.cap)));
  });
  it('a solar particle event alert is red exposure', () => {
    const h = health({ radiation: 0.2, spe: true });
    expect(h.triage.top.id).toBe('radiation');
    expect(h.cap).toBe(55);
  });
  it('no readings → no score and no queue priority', () => {
    const h = computeHealth({});
    expect(h.score).toBeNull();
    expect(h.triage).toEqual({ tier: null, top: null, flags: [], priority: 0 });
  });
  it('explains the cap in plain words', () => {
    expect(computeScore(evaluateReading({ ...OPTIMAL, hr: 128 })).capReason).toBe('Capped at 45%: circulation (ABCDE C) is red, emergent.');
    expect(computeScore(evaluateReading(OPTIMAL)).capReason).toBeNull();
  });
});

describe('Flight surgeon queue: triage priority score', () => {
  const p = (over) => triageOf(evaluateReading({ ...OPTIMAL, ...over })).priority;
  it('tier weight + ABCDE rank score + 5 per flag', () => {
    expect(p({})).toBe(100);
    expect(p({ sleep: 5.5 })).toBe(500 + 10 + 5);
    expect(p({ hr: 96 })).toBe(500 + 40 + 5);
    expect(p({ temp: 38.2 })).toBe(1000 + 20 + 5);
    expect(p({ hr: 128 })).toBe(1000 + 40 + 5);
    expect(p({ hr: 128, temp: 38.6 })).toBe(1000 + 40 + 10);
  });
  it('sorts red before amber before green, then by ABCDE rank, then by flag count', () => {
    const people = {
      sleepAmber: { sleep: 5.5 },
      fever: { temp: 38.2 },
      nominal: {},
      tachy: { hr: 128 },
      tachyFever: { hr: 128, temp: 38.6 },
      hrAmber: { hr: 96 },
    };
    const order = Object.entries(people).sort(([, a], [, b]) => p(b) - p(a)).map(([k]) => k);
    expect(order).toEqual(['tachyFever', 'tachy', 'fever', 'hrAmber', 'sleepAmber', 'nominal']);
  });
});
