/**
 * Wearable telemetry helpers.
 *
 * 1. Parsers for standard Bluetooth GATT health profiles (Bluetooth SIG specs):
 *    - Heart Rate Measurement            service 0x180D, characteristic 0x2A37
 *    - Health Thermometer Temperature    service 0x1809, characteristic 0x2A1C
 *    - Blood Pressure Measurement        service 0x1810, characteristic 0x2A35
 * 2. Aggregation of live samples into a log entry ("Sync to log").
 */
import { TELEMETRY_METRICS } from '../config/thresholds.js';

export const BLE_PROFILES = {
  heartRate: { service: 0x180d, characteristic: 0x2a37, label: 'Heart-rate monitor (chest strap / watch)', metrics: ['hr'] },
  thermometer: { service: 0x1809, characteristic: 0x2a1c, label: 'Thermometer', metrics: ['temp'] },
  bloodPressure: { service: 0x1810, characteristic: 0x2a35, label: 'Blood-pressure cuff', metrics: ['sys', 'dia', 'hr'] },
};

/** IEEE-11073 16-bit SFLOAT → number (NaN for reserved/special values). */
export function sfloat(raw) {
  const special = [0x07ff, 0x0800, 0x07fe, 0x0802, 0x0801];
  if (special.includes(raw)) return NaN;
  let mantissa = raw & 0x0fff;
  let exponent = raw >> 12;
  if (mantissa >= 0x0800) mantissa -= 0x1000;
  if (exponent >= 0x8) exponent -= 0x10;
  return mantissa * 10 ** exponent;
}

/** IEEE-11073 32-bit FLOAT → number. */
export function float32(raw) {
  const special = [0x007fffff, 0x00800000, 0x007ffffe, 0x00800002, 0x00800001];
  if (special.includes(raw)) return NaN;
  let mantissa = raw & 0x00ffffff;
  let exponent = (raw >> 24) & 0xff;
  if (mantissa >= 0x00800000) mantissa -= 0x01000000;
  if (exponent >= 0x80) exponent -= 0x100;
  return mantissa * 10 ** exponent;
}

const round = (v, dp) => Number(v.toFixed(dp));

/** Heart Rate Measurement (0x2A37). */
export function parseHeartRate(view) {
  const flags = view.getUint8(0);
  const hr = flags & 0x01 ? view.getUint16(1, true) : view.getUint8(1);
  return { hr };
}

/** Temperature Measurement (0x2A1C). Converts °F to °C. */
export function parseTemperature(view) {
  const flags = view.getUint8(0);
  let t = float32(view.getUint32(1, true));
  if (flags & 0x01) t = ((t - 32) * 5) / 9;
  return { temp: round(t, 2) };
}

/** Blood Pressure Measurement (0x2A35). Converts kPa to mmHg. */
export function parseBloodPressure(view) {
  const flags = view.getUint8(0);
  const kpa = Boolean(flags & 0x01);
  const conv = (v) => (kpa ? v * 7.50062 : v);
  const out = {
    sys: Math.round(conv(sfloat(view.getUint16(1, true)))),
    dia: Math.round(conv(sfloat(view.getUint16(3, true)))),
  };
  let offset = 7; // flags(1) + sys(2) + dia(2) + MAP(2)
  if (flags & 0x02) offset += 7; // timestamp
  if (flags & 0x04 && view.byteLength >= offset + 2) {
    const pulse = sfloat(view.getUint16(offset, true));
    if (Number.isFinite(pulse)) out.hr = Math.round(pulse);
  }
  return out;
}

const median = (a) => {
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/**
 * Build a log entry from live samples.
 * Heart rate uses the MEDIAN over the window (a resting estimate that ignores
 * spikes); every other metric uses its most recent sample in the window.
 *
 * @param {Array<{metric, value, ts, deviceName}>} samples
 * @param {number} windowMs
 * @returns {{ values, counts, devices, from, to, notes } | null}
 */
export function aggregateForSync(samples, windowMs = 15 * 60_000, now = Date.now()) {
  const since = new Date(now).getTime() - windowMs;
  const inWindow = samples.filter((s) => {
    const t = new Date(s.ts).getTime();
    return t >= since && t <= new Date(now).getTime() && TELEMETRY_METRICS[s.metric] && Number.isFinite(s.value);
  });
  if (!inWindow.length) return null;
  const byMetric = {};
  for (const s of inWindow) (byMetric[s.metric] ??= []).push(s);
  const values = {};
  const counts = {};
  for (const [metric, list] of Object.entries(byMetric)) {
    list.sort((a, b) => new Date(a.ts) - new Date(b.ts));
    counts[metric] = list.length;
    values[metric] = metric === 'hr' ? Math.round(median(list.map((s) => s.value))) : list[list.length - 1].value;
  }
  if (values.sys !== undefined && values.dia === undefined) delete values.sys;
  if (values.dia !== undefined && values.sys === undefined) delete values.dia;
  const devices = [...new Set(inWindow.map((s) => s.deviceName || s.deviceId || 'Unknown device'))];
  const times = inWindow.map((s) => new Date(s.ts).getTime());
  const from = new Date(Math.min(...times)).toISOString();
  const to = new Date(Math.max(...times)).toISOString();
  const hhmm = (iso) => new Date(iso).toTimeString().slice(0, 5);
  const parts = Object.entries(counts).map(([m, n]) => `${TELEMETRY_METRICS[m].label} ${n} sample${n > 1 ? 's' : ''}`);
  const notes = `Synced from wearable telemetry (${devices.join(', ')}), ${hhmm(from)}–${hhmm(to)}: ${parts.join('; ')}.${values.hr !== undefined ? ' Heart rate = median of the window.' : ''}`;
  return { values, counts, devices, from, to, notes };
}

/** Keep only the last `keepMs` of samples (bounded memory). */
export function pruneSamples(samples, keepMs = 2 * 3_600_000, now = Date.now()) {
  const since = new Date(now).getTime() - keepMs;
  return samples.filter((s) => new Date(s.ts).getTime() >= since).slice(-5000);
}

/** Server-side validation of an ingest payload. Returns error strings. */
export function validateTelemetryPayload(p) {
  const errors = [];
  if (!p || typeof p !== 'object') return ['Payload must be an object.'];
  if (typeof p.crewId !== 'string' || !p.crewId) errors.push('crewId is required.');
  if (typeof p.deviceId !== 'string' || !p.deviceId) errors.push('deviceId is required.');
  if (!Array.isArray(p.samples) || !p.samples.length) errors.push('samples must be a non-empty array.');
  else if (p.samples.length > 1000) errors.push('At most 1000 samples per request.');
  else {
    p.samples.forEach((s, i) => {
      if (!s || !TELEMETRY_METRICS[s.metric]) errors.push(`samples[${i}].metric must be one of ${Object.keys(TELEMETRY_METRICS).join(', ')}.`);
      if (!s || typeof s.value !== 'number' || !Number.isFinite(s.value)) errors.push(`samples[${i}].value must be a number.`);
      if (s && s.ts !== undefined && Number.isNaN(new Date(s.ts).getTime())) errors.push(`samples[${i}].ts must be an ISO date.`);
    });
  }
  return errors.slice(0, 20);
}
