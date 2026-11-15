import { INDICATORS } from '../config/thresholds.js';

export function formatIndicatorValue(id, reading) {
  if (!reading) return '—';
  switch (id) {
    case 'bp':
      return reading.sys != null && reading.dia != null ? `${reading.sys}/${reading.dia}` : '—';
    case 'temp':
      return reading.temp != null ? Number(reading.temp).toFixed(1) : '—';
    case 'sleep':
      return reading.sleep != null ? Number(reading.sleep).toFixed(1) : '—';
    case 'radiation':
      return reading.radiation != null ? formatDose(reading.radiation) : '—';
    default:
      return reading[id] != null && !Number.isNaN(reading[id]) ? String(reading[id]) : '—';
  }
}

export function formatDose(mGy) {
  const v = Number(mGy);
  return v < 0.1 ? v.toFixed(3) : v.toFixed(2);
}

export function regionLabel(id, reading, severity) {
  const m = INDICATORS.find((i) => i.id === id);
  const names = { spo2: 'Lungs', hr: 'Heart', bp: 'Vessels', glucose: 'Pancreas', temp: 'Thermal', sleep: 'Brain', radiation: 'Radiation' };
  const sev = severity ? severity[0].toUpperCase() + severity.slice(1) : '';
  return `${names[id]}: ${formatIndicatorValue(id, reading)} ${m.unit}, ${sev}`;
}

export const REGION_NAMES = {
  lungs: 'Chest (lungs)',
  heart: 'Heart (chest)',
  vessels: 'Upper arm and major vessels',
  pancreas: 'Abdomen (pancreas)',
  skin_shell: 'Forehead (temperature)',
  brain: 'Temple (sleep)',
  radiation_shell: 'Pelvis and bone marrow (radiation)',
};

const pad = (n) => String(n).padStart(2, '0');

/** "14 Nov 2026" in the viewer's locale-neutral format. */
export function formatDate(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/** "07:42" local time. */
export function formatTime(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDateTime(ts) {
  return `${formatDate(ts)} ${formatTime(ts)}`;
}

/** "just now", "12 min ago", "3 h ago", "2 days ago". */
export function relativeTime(ts, now = Date.now()) {
  const diff = Math.max(0, new Date(now).getTime() - new Date(ts).getTime());
  const min = Math.round(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 36) return `${h} h ago`;
  return `${Math.round(h / 24)} days ago`;
}

/** Value for <input type="date"> / <input type="time"> in local time. */
export function toDateInput(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function toTimeInput(ts) {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const SOURCE_LABEL = { manual: 'Manual', wearable: 'Wearable sync', sample: 'Sample data' };
