/**
 * Sample log history for `npm run seed`: the last N days of timestamped logs
 * per crew member, relative to the moment the seed runs. Every entry is
 * tagged `source: "sample"` so the UI can label (and the crew can delete) it.
 *
 * Each day: a morning manual check-in (~07:10, all indicators) and an evening
 * wearable sync (~21:00, heart rate only, "Polar H10").
 * Commander storyline: weeks 1 nominal → week 2 sleep decline and raised heart
 * rate → a solar particle event 5 days ago → glucose creeping up the last 3 days.
 */
const DAY = 86_400_000;

import { CREW } from './people.js';

export { CREW };

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Commander profile by "days ago" (positive = past). */
function c1Profile(d) {
  const p = { hr: 64, sys: 116, dia: 74, glucose: 88, temp: 36.7, sleep: 7.6, rad: 0.47, notes: 'Morning check: fasting, before exercise.' };
  if (d <= 14 && d >= 7) {
    const k = (15 - d) / 8; // 0.125 → 1
    p.hr = 66 + 28 * k;
    p.sys = 118 + 14 * k;
    p.dia = 76 + 10 * k;
    p.sleep = 7.3 - 1.6 * k;
    p.notes = 'Morning check. Heavy workload this week; sleep station noisy.';
  }
  if (d === 9 || d === 8) {
    p.sleep = 5.6;
    p.notes = 'Slept badly again, woke several times. Feeling on edge.';
  }
  if (d <= 6 && d >= 4) {
    p.hr = 72 - (6 - d) * 3;
    p.sleep = 7.0 + (6 - d) * 0.2;
    p.notes = 'Following the sleep protocol; private family call yesterday.';
  }
  if (d === 5) {
    p.rad = 3.2;
    p.spe = true;
    p.notes = 'Solar particle event alert 03:40. Spent 9 h in the storm shelter.';
  }
  if (d <= 3 && d >= 0) {
    p.glucose = 100 + (4 - d) * 4;
    p.notes = 'Morning check. Skipped two exercise sessions (treadmill maintenance).';
  }
  return p;
}

function otherProfile(id, d) {
  const base = {
    c2: { hr: 60, sys: 121, dia: 79, glucose: 92, temp: 36.6, sleep: 7.2 },
    c3: { hr: 68, sys: 111, dia: 70, glucose: 85, temp: 36.8, sleep: 7.1 },
    c4: { hr: 58, sys: 118, dia: 76, glucose: 90, temp: 36.5, sleep: 7.4 },
    c5: { hr: 66, sys: 112, dia: 72, glucose: 86, temp: 36.7, sleep: 7.2 },
  }[id];
  const p = { ...base, rad: 0.46, notes: 'Morning check.' };
  if (id === 'c2' && d <= 6) {
    p.sys = 124 + (7 - d) * 3;
    p.dia = 80 + (7 - d) * 1.6;
  }
  if (id === 'c3' && d <= 4) p.sleep = 6.4 - (4 - d) * 0.2;
  if (id === 'c5' && d <= 2) {
    p.temp = 37.5 + (2 - d) * 0.15;
    p.spo2 = 95 - (2 - d); // 95 → 93 %: oxygen drifting down with the chest infection (amber, ABCDE A/B)
    p.hr = 78;
    p.notes = 'Morning check. Sore throat and chills since last night.';
  }
  if (d === 5) {
    p.rad = 3.0;
    p.spe = true;
    p.notes = 'Solar particle event: sheltered with the crew.';
  }
  return p;
}

export function generateSampleLogs({ days = 21, now = Date.now(), seed = 20261115 } = {}) {
  const logs = [];
  CREW.forEach((c, ci) => {
    const r = rng(seed + ci * 7919);
    const j = (amp) => (r() * 2 - 1) * amp;
    // Days ago, down to today; entries whose time has not come yet are skipped.
    for (let d = days; d >= 0; d -= 1) {
      const dayStart = new Date(now - d * DAY);
      dayStart.setHours(0, 0, 0, 0);
      const p = c.id === 'c1' ? c1Profile(d) : otherProfile(c.id, d);
      const morning = new Date(dayStart.getTime() + (7 * 60 + 5 + Math.floor(r() * 20)) * 60_000);
      if (morning.getTime() <= now) logs.push({
        id: `sample-${c.id}-${d}-am`,
        crewId: c.id,
        ts: morning.toISOString(),
        // Blood oxygen does not draw from the random stream, so every other sample value stays as before.
        spo2: p.spo2 ?? 97 + ((d + ci) % 3),
        hr: Math.round(p.hr + j(1.5)),
        sys: Math.round(p.sys + j(2)),
        dia: Math.round(p.dia + j(1.5)),
        glucose: Math.round(p.glucose + j(2)),
        temp: Number((p.temp + j(0.08)).toFixed(1)),
        sleep: Number((p.sleep + j(0.1)).toFixed(1)),
        radiation: Number((p.rad + j(0.008)).toFixed(3)),
        spe: Boolean(p.spe),
        environment: 'marsTransit',
        source: 'sample',
        device: 'Manual entry',
        notes: p.notes,
      });
      const evening = new Date(dayStart.getTime() + (20 * 60 + 50 + Math.floor(r() * 25)) * 60_000);
      if (evening.getTime() <= now) logs.push({
        id: `sample-${c.id}-${d}-pm`,
        crewId: c.id,
        ts: evening.toISOString(),
        hr: Math.round(p.hr + 2 + j(2)),
        environment: 'marsTransit',
        source: 'sample',
        device: 'Polar H10 (wearable sync)',
        notes: 'Evening wearable sync: resting heart rate, median of 15 min.',
      });
    }
  });
  return logs;
}
