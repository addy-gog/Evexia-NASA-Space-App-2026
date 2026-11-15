import { describe, it, expect } from 'vitest';
import { sfloat, float32, parseHeartRate, parseTemperature, parseBloodPressure, aggregateForSync, pruneSamples, validateTelemetryPayload } from '../src/lib/telemetry.js';
import { ruleBasedAnswer, detectIndicators, summaryMessage } from '../src/lib/ruleAssistant.js';
import { buildEscalationReport, reportToText, validateEscalationPayload } from '../src/lib/escalation.js';
import { evaluateCurrent } from '../src/lib/evaluate.js';
import { evaluateReading } from '../src/lib/severity.js';

const view = (bytes) => new DataView(Uint8Array.from(bytes).buffer);

describe('Bluetooth GATT parsers', () => {
  it('heart rate: 8-bit and 16-bit formats', () => {
    expect(parseHeartRate(view([0x00, 72]))).toEqual({ hr: 72 });
    expect(parseHeartRate(view([0x01, 0x2c, 0x01]))).toEqual({ hr: 300 });
  });
  it('IEEE-11073 SFLOAT and FLOAT', () => {
    expect(sfloat(0xf16f)).toBeCloseTo(36.7, 5); // exponent -1, mantissa 367
    expect(sfloat(0x07ff)).toBeNaN();
    expect(float32(0xff00016f)).toBeCloseTo(36.7, 5);
  });
  it('temperature: °C and °F', () => {
    expect(parseTemperature(view([0x00, 0x6f, 0x01, 0x00, 0xff]))).toEqual({ temp: 36.7 });
    // 98.6 °F = 986 × 10^-1 → 37 °C
    expect(parseTemperature(view([0x01, 0xda, 0x03, 0x00, 0xff]))).toEqual({ temp: 37 });
  });
  it('blood pressure: mmHg with pulse, and kPa', () => {
    // flags: mmHg + pulse present; sys 120, dia 80, MAP 93, pulse 66 (SFLOAT exponent 0)
    expect(parseBloodPressure(view([0x04, 120, 0x00, 80, 0x00, 93, 0x00, 66, 0x00]))).toEqual({ sys: 120, dia: 80, hr: 66 });
    // kPa: 16.0 / 10.7 kPa (exponent -1) → 120 / 80 mmHg
    expect(parseBloodPressure(view([0x01, 0xa0, 0xf0, 0x6b, 0xf0, 0x00, 0x00]))).toEqual({ sys: 120, dia: 80 });
  });
});

describe('telemetry → log sync', () => {
  const NOW = Date.parse('2026-11-14T08:00:00Z');
  const s = (metric, value, minAgo, deviceName = 'Polar H10') => ({ crewId: 'c1', deviceId: deviceName, deviceName, metric, value, ts: new Date(NOW - minAgo * 60_000).toISOString() });
  const samples = [s('hr', 60, 14), s('hr', 62, 10), s('hr', 140, 9), s('hr', 64, 5), s('hr', 63, 1), s('temp', 36.6, 20, 'Thermo'), s('temp', 36.8, 3, 'Thermo'), s('sys', 121, 2, 'Cuff'), s('hr', 99, 40)];
  it('heart rate = median of the window (ignores spikes); others = latest in window', () => {
    const a = aggregateForSync(samples, 15 * 60_000, NOW);
    expect(a.values).toEqual({ hr: 63, temp: 36.8 }); // sys dropped without dia
    expect(a.counts).toEqual({ hr: 5, temp: 1, sys: 1 });
    expect(a.devices).toEqual(['Polar H10', 'Thermo', 'Cuff']);
    expect(a.notes).toMatch(/Synced from wearable telemetry/);
    expect(a.notes).toMatch(/median/);
  });
  it('keeps systolic and diastolic only as a pair', () => {
    const a = aggregateForSync([s('sys', 121, 2, 'Cuff'), s('dia', 79, 2, 'Cuff')], 15 * 60_000, NOW);
    expect(a.values).toEqual({ sys: 121, dia: 79 });
  });
  it('returns null when the window is empty', () => {
    expect(aggregateForSync(samples, 30_000, NOW)).toBeNull();
  });
  it('prunes old samples', () => {
    expect(pruneSamples(samples, 30 * 60_000, NOW)).toHaveLength(8);
  });
  it('validates gateway payloads', () => {
    expect(validateTelemetryPayload({ crewId: 'c1', deviceId: 'w', samples: [{ metric: 'hr', value: 70 }] })).toEqual([]);
    expect(validateTelemetryPayload({})).toHaveLength(3);
    const e = validateTelemetryPayload({ crewId: 'c1', deviceId: 'w', samples: [{ metric: 'co2', value: 'x', ts: 'nope' }] }); // co2 is not a body metric
    expect(e.join(' ')).toMatch(/metric must be one of/);
    expect(e.join(' ')).toMatch(/value must be a number/);
    expect(e.join(' ')).toMatch(/ISO date/);
  });
});

describe('rule-based assistant (offline fallback)', () => {
  it('detects indicators from the question', () => {
    expect(detectIndicators('Why is my heart rate amber?')).toEqual(['hr']);
    expect(detectIndicators('What should I do about my sleep?')).toEqual(['sleep']);
  });
  it('explains amber heart rate and never diagnoses', () => {
    const a = ruleBasedAnswer('Why is my heart rate amber?', { results: evaluateReading({ hr: 96 }), delaySeconds: 0 });
    expect(a).toMatch(/Resting heart rate is CAUTION/);
    expect(a).toMatch(/not a diagnosis/);
  });
  it('chip intents: what first, why the delay matters, draft a report', () => {
    const results = evaluateReading({ hr: 96, glucose: 130, sleep: 7.5 });
    const ctx = { results, delaySeconds: 720, environmentLabel: 'Mars transit', score: 59, tier: 'Act now', missionDay: 61, crewName: 'Cdr. Ada Okafor' };
    expect(ruleBasedAnswer('What should I do first?', ctx)).toMatch(/^IITT Red \(Emergent\): needs care immediately\. Start with glucose \(critical\)/);
    expect(ruleBasedAnswer('What should I do first?', ctx)).toMatch(/escalate to the flight surgeon now/);
    expect(ruleBasedAnswer('Why does the delay matter?', ctx)).toMatch(/about 12 min each way.*Autonomy mode/s);
    expect(ruleBasedAnswer('Why does the delay matter?', { ...ctx, delaySeconds: 0 })).toMatch(/near real time/);
    const report = ruleBasedAnswer('Draft a report', ctx);
    expect(report).toMatch(/Cdr. Ada Okafor · Mission day 61 · Mars transit/);
    expect(report).toContain('Fasting blood glucose: 130 mg/dL · CRITICAL');
    expect(summaryMessage(ctx)).toMatch(/^Score 59 · Act now\. IITT Red \(Emergent\): needs care immediately\. Glucose \(critical\), Heart rate \(caution\) need attention/);
    expect(summaryMessage({ results: {} })).toMatch(/No current readings/);
  });
  it('explains the score, IITT tier, ABCDE order and the cap', () => {
    // Everything else optimal, so the weighted score sits above the circulation red cap and the cap applies.
    const results = evaluateReading({ hr: 128, temp: 38.6, sys: 112, dia: 72, glucose: 82, sleep: 8, radiation: 0 });
    for (const q of ['Explain my score', 'Why is my score capped?', 'What is my triage?', 'How does the ABCDE queue work?']) {
      const a = ruleBasedAnswer(q, { results });
      expect(a).toMatch(/IITT Red \(Emergent\), target immediate/);
      expect(a).toMatch(/1\. Heart rate \(critical\): ABCDE C, circulation\n2\. Temperature \(critical\): ABCDE E/);
      expect(a).toMatch(/Capped at 45%: circulation \(ABCDE C\) is red, emergent\./);
      expect(a).toMatch(/7 points are taken off/);
      expect(a).toMatch(/not a diagnosis/);
    }
    expect(ruleBasedAnswer('Explain my score', { results: evaluateReading({ hr: 70, sleep: 8 }) })).toMatch(/Nothing is flagged, so there is no cap/);
    expect(ruleBasedAnswer('Explain my score', { results: {} })).toMatch(/No current readings yet/);
  });
  it('orders flags by IITT colour, then ABCDE: red sleep before amber heart rate', () => {
    const results = evaluateReading({ hr: 95, sleep: 4 });
    expect(ruleBasedAnswer('What should I do first?', { results })).toMatch(/^IITT Red \(Emergent\): needs care immediately\. Start with sleep/);
    // Same colour: circulation (C) before exposure (E).
    expect(ruleBasedAnswer('What should I do first?', { results: evaluateReading({ temp: 37.6, hr: 95 }) })).toMatch(/^IITT Yellow \(Urgent\): needs care within 60 minutes\. Start with heart rate/);
  });
  it('red → escalation; self-care first only with a long delay', () => {
    const results = evaluateReading({ glucose: 130 });
    const a = ruleBasedAnswer('glucose?', { results, delaySeconds: 900, environmentLabel: 'Mars transit' });
    expect(a).toMatch(/escalation report/);
    expect(a.indexOf('Self-care now')).toBeLessThan(a.indexOf('Next steps'));
    const b = ruleBasedAnswer('glucose?', { results, delaySeconds: 0 });
    expect(b.indexOf('Next steps')).toBeLessThan(b.indexOf('Self-care now'));
  });
});

describe('escalation report', () => {
  const NOW = Date.parse('2026-11-14T08:00:00Z');
  const logs = [{ id: 'a', crewId: 'c1', ts: '2026-11-14T07:10:00Z', hr: 70, sys: 118, dia: 76, glucose: 130, temp: 36.8, sleep: 7.5, radiation: 0.48, environment: 'marsTransit', source: 'manual', device: 'Manual entry' }];
  const status = evaluateCurrent(logs, { environment: 'marsTransit', missionStart: '2026-09-15' }, NOW);
  const crew = { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander' };
  it('builds a valid structured report with measurement times', () => {
    const r = buildEscalationReport({ crew, status, environment: 'marsTransit', delaySeconds: 720, actionsTaken: ['Re-tested glucose'] });
    expect(validateEscalationPayload(r)).toEqual([]);
    expect(r.overallSeverity).toBe('red');
    expect(r.readings.glucose).toMatchObject({ value: 130, measuredAt: '2026-11-14T07:10:00Z' });
    expect(r.readings.radiation.estimatedMsvPerDay).toBeCloseTo(1.824, 3);
    expect(r.missionDay).toBe(61);
    const t = reportToText(r);
    expect(t).toMatch(/EVEXIA FLIGHT SURGEON ESCALATION REPORT/);
    expect(t).toMatch(/2026-11-14 07:10 UTC/);
    expect(t).toMatch(/Message will arrive in 12 min/);
    expect(t).toMatch(/Re-tested glucose/);
  });
  it('emergency priority', () => {
    const r = buildEscalationReport({ crew, status, environment: 'station', delaySeconds: 0, priority: 'emergency' });
    expect(r.priority).toBe('emergency');
    expect(reportToText(r)).toMatch(/\*\*\* EMERGENCY \*\*\*/);
  });
  it('rejects invalid payloads', () => {
    expect(validateEscalationPayload(null)).toHaveLength(1);
    expect(validateEscalationPayload({}).length).toBeGreaterThan(3);
    expect(validateEscalationPayload({ ...buildEscalationReport({ crew, status, environment: 'station', delaySeconds: 0 }), priority: 'urgent' })).toHaveLength(1);
  });
});
