import { THRESHOLDS, ENVIRONMENTS } from './thresholds.js';

/** Editable reading fields: slider ranges are practical; typed values may go wider (validated). */
export const FIELDS = [
  { key: 'spo2', indicator: 'spo2', label: 'Blood oxygen (SpO₂)', unit: '%', slider: [80, 100], step: 1 },
  { key: 'hr', indicator: 'hr', label: 'Resting heart rate', unit: 'bpm', slider: [30, 150], step: 1 },
  { key: 'sys', indicator: 'bp', label: 'Blood pressure: systolic (top number)', unit: 'mmHg', slider: [70, 200], step: 1 },
  { key: 'dia', indicator: 'bp', label: 'Blood pressure: diastolic (bottom number)', unit: 'mmHg', slider: [40, 130], step: 1 },
  { key: 'glucose', indicator: 'glucose', label: 'Fasting blood glucose', unit: 'mg/dL', slider: [40, 250], step: 1 },
  { key: 'temp', indicator: 'temp', label: 'Body temperature', unit: '°C', slider: [34, 41], step: 0.1 },
  { key: 'sleep', indicator: 'sleep', label: 'Sleep last night', unit: 'hours', slider: [0, 12], step: 0.1 },
  { key: 'radiation', indicator: 'radiation', label: 'Dosimeter: absorbed dose, last 24 h', unit: 'mGy/day', slider: [0, 5], step: 0.01 },
];

export const FIELD_BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.key, f]));

/** Short "nominal range" text for a reading card. */
export function rangeText(id, environment) {
  const t = THRESHOLDS;
  switch (id) {
    case 'spo2':
      return `Nominal ${t.spo2.green[0]}–${t.spo2.green[1]}%`;
    case 'hr':
      return `Nominal ${t.hr.green[0]}–${t.hr.green[1]}`;
    case 'bp':
      return `Nominal ${t.sys.green[0]}–${t.sys.green[1]} / ${t.dia.green[0]}–${t.dia.green[1]}`;
    case 'glucose':
      return `Nominal ${t.glucose.green[0]}–${t.glucose.green[1]} (fasting)`;
    case 'temp':
      return `Nominal ${t.temp.green[0]}–${t.temp.green[1]}`;
    case 'sleep':
      return `Target ${t.sleep.greenMin} h or more`;
    case 'radiation': {
      const env = ENVIRONMENTS[environment] ?? ENVIRONMENTS.station;
      const mgy = env.radiationGreenBelowMsv / env.qualityFactor;
      return `Nominal below ${mgy.toFixed(2)} mGy/day (≈${env.radiationGreenBelowMsv} mSv)`;
    }
    default:
      return '';
  }
}

/** Hotspot placement on the body (brief §4): chest (lungs), forehead, temple, heart, upper arm, abdomen, pelvis. */
export const HOTSPOTS = {
  spo2: { short: 'O₂', anchor: [-0.1, 1.2, 0.16], side: 'left', pos2d: [84, 96] },
  temp: { short: 'Temp', anchor: [0, 1.7, 0.19], side: 'left', pos2d: [100, 22] },
  sleep: { short: 'Sleep', anchor: [0.17, 1.6, 0.07], side: 'right', pos2d: [122, 40] },
  hr: { short: 'Heart', anchor: [0.08, 0.98, 0.17], side: 'right', pos2d: [112, 112] },
  bp: { short: 'BP', anchor: [-0.37, 1.06, 0.08], side: 'left', pos2d: [48, 120] },
  glucose: { short: 'Glucose', anchor: [0.03, 0.5, 0.16], side: 'right', pos2d: [100, 172] },
  radiation: { short: 'Radiation', anchor: [0, 0.18, 0.17], side: 'left', pos2d: [100, 214] },
};
