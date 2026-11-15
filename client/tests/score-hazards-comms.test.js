import { describe, it, expect } from 'vitest';
import { scoreBand } from '../src/lib/score.js';
import { correlateHazards } from '../src/lib/hazards.js';
import { commsPolicy, selfCareFirst, formatDelay } from '../src/lib/comms.js';
import { evaluateReading, classifyCumulativeDose } from '../src/lib/severity.js';
import { INDICATORS } from '../src/config/thresholds.js';


describe('health score', () => {
  it('weights sum to 100', () => {
    expect(INDICATORS.reduce((s, m) => s + m.weight, 0)).toBe(100);
    expect(Object.fromEntries(INDICATORS.map((m) => [m.id, m.weight]))).toEqual({
      spo2: 20, hr: 15, bp: 15, sleep: 15, glucose: 15, radiation: 10, temp: 10,
    });
  });
  // The score maths (IITT + ABCDE) is covered in tests/triage.test.js.
  it('band boundaries', () => {
    expect(scoreBand(85).label).toBe('Mission ready');
    expect(scoreBand(84).label).toBe('Monitor closely');
    expect(scoreBand(60).label).toBe('Monitor closely');
    expect(scoreBand(59).label).toBe('Act now');
  });
});

describe('hazard correlation', () => {
  const ids = (h) => h.map((x) => x.id);
  it('sleep amber + HR amber + ≥14 days since contact → isolation behavioural health risk', () => {
    const r = evaluateReading({ sleep: 6.3, hr: 95 });
    const h = correlateHazards(r, { daysSinceContact: 14 });
    const iso = h.find((x) => x.id === 'behavioural-health');
    expect(iso).toBeTruthy();
    expect(iso.hazard).toBe('isolation');
    expect(iso.title).toBe('Isolation and confinement: behavioural health risk');
  });
  it('no isolation insight with recent contact', () => {
    const r = evaluateReading({ sleep: 6.3, hr: 95 });
    expect(ids(correlateHazards(r, { daysSinceContact: 13 }))).not.toContain('behavioural-health');
  });
  it('radiation amber → shielding / storm shelter insight', () => {
    const r = evaluateReading({ radiation: 0.5 }, { environment: 'station' });
    const h = correlateHazards(r);
    expect(h[0].title).toBe('Space radiation: review shielding and time in the storm shelter');
  });
  it('solar particle event → storm shelter, red', () => {
    const r = evaluateReading({ radiation: 3.2, spe: true }, { environment: 'marsTransit' });
    const h = correlateHazards(r).find((x) => x.id === 'radiation-dose');
    expect(h.severity).toBe('red');
    expect(h.title).toMatch(/solar particle event/);
  });
  it('green radiation → no radiation insight', () => {
    const r = evaluateReading({ radiation: 0.25 }, { environment: 'station' });
    expect(correlateHazards(r)).toEqual([]);
  });
  it('cumulative dose amber → cumulative insight', () => {
    const h = correlateHazards({}, { cumulative: classifyCumulativeDose(350) });
    expect(ids(h)).toEqual(['cumulative-dose']);
  });
  it('blood pressure out of range → gravity fluid-shift insight', () => {
    const h = correlateHazards(evaluateReading({ sys: 135, dia: 80 }));
    expect(h.find((x) => x.id === 'fluid-shift').hazard).toBe('gravity');
  });
  it('HR + BP up → stress load', () => {
    expect(ids(correlateHazards(evaluateReading({ hr: 95, sys: 135, dia: 80 })))).toContain('stress-load');
  });
  it('fever → hostile environment infection risk', () => {
    const h = correlateHazards(evaluateReading({ temp: 38.4 }));
    expect(h[0]).toMatchObject({ id: 'infection-risk', hazard: 'hostileEnvironment', severity: 'red' });
  });
  it('low temperature does not trigger infection insight', () => {
    expect(correlateHazards(evaluateReading({ temp: 35.8 }))).toEqual([]);
  });
  it('glucose + sleep → metabolic stress', () => {
    expect(ids(correlateHazards(evaluateReading({ glucose: 110, sleep: 6.2 })))).toContain('metabolic-stress');
  });
  it('red finding with long delay → distance from Earth autonomy insight', () => {
    const r = evaluateReading({ glucose: 130 });
    expect(ids(correlateHazards(r, { delaySeconds: 12 * 60 }))).toContain('distance-autonomy');
    expect(ids(correlateHazards(r, { delaySeconds: 0 }))).not.toContain('distance-autonomy');
  });
  it('every insight carries source tags', () => {
    const r = evaluateReading({ sleep: 5.5, hr: 105, sys: 145, dia: 95, temp: 38.5, glucose: 130, radiation: 1.5 });
    const h = correlateHazards(r, { daysSinceContact: 20, delaySeconds: 900, cumulative: classifyCumulativeDose(500) });
    expect(h.length).toBeGreaterThanOrEqual(8);
    for (const x of h) expect(x.sources.length).toBeGreaterThan(0);
  });
});

describe('comms-delay autonomy', () => {
  it('self-care first only above 5 minutes', () => {
    expect(selfCareFirst(0)).toBe(false);
    expect(selfCareFirst(300)).toBe(false);
    expect(selfCareFirst(301)).toBe(true);
    expect(selfCareFirst(12 * 60)).toBe(true);
  });
  it('short delay escalates amber; long delay escalates red only', () => {
    expect(commsPolicy('amber', 0, 'station').recommendEscalation).toBe(true);
    expect(commsPolicy('amber', 720, 'marsTransit').recommendEscalation).toBe(false);
    expect(commsPolicy('red', 720, 'marsTransit').recommendEscalation).toBe(true);
    expect(commsPolicy('green', 0, 'station').recommendEscalation).toBe(false);
  });
  it('long delay arrival text says when the message will arrive', () => {
    const p = commsPolicy('red', 720, 'marsTransit');
    expect(p.selfCareFirst).toBe(true);
    expect(p.arrivalText).toMatch(/Message will arrive in 12 min/);
    expect(p.autonomy).toBe('High');
  });
  it('formats delays', () => {
    expect(formatDelay(0)).toBe('real-time');
    expect(formatDelay(1.3)).toBe('1.3 s');
    expect(formatDelay(270)).toBe('4.5 min');
    expect(formatDelay(720)).toBe('12 min');
  });
});
