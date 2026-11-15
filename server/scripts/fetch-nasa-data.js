/**
 * `npm run data:nasa`: downloads real NASA radiation measurements from the
 * OSDR RadLab API and writes compact, provenance-tagged JSON files to
 * server/data/nasa/. The app ships these files so it works offline.
 *
 * RadLab API docs: https://visualization.osdr.nasa.gov/radlab/gui/data-api/
 * Units from RadLab: absorbed_dose_rate in µGy/hour.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'data', 'nasa');
const API = 'https://visualization.osdr.nasa.gov/radlab/api/';

async function radlab(query) {
  const url = `${API}?${query}&absorbed_dose_rate&format=json`;
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`RadLab HTTP ${res.status} for ${url}`);
  const j = await res.json();
  const c = j.columns;
  const rows = j.data.map((r) => Object.fromEntries(c.map((k, i) => [k, r[i]])));
  return { url, rows };
}

const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;

/** Hourly means of absorbed dose rate (µGy/h) for one instrument. */
function hourly(rows) {
  const byHour = new Map();
  for (const r of rows) {
    if (r.absorbed_dose_rate == null) continue;
    const h = `${r.timestamp.slice(0, 13)}:00:00Z`;
    if (!byHour.has(h)) byHour.set(h, []);
    byHour.get(h).push(r.absorbed_dose_rate);
  }
  return [...byHour.entries()].sort().map(([t, v]) => ({ t, uGyPerHour: Number(mean(v).toFixed(3)), n: v.length }));
}

function daily(rows) {
  const byDay = new Map();
  for (const r of rows) {
    if (r.absorbed_dose_rate == null) continue;
    const d = r.timestamp.slice(0, 10);
    if (!byDay.has(d)) byDay.set(d, []);
    byDay.get(d).push(r.absorbed_dose_rate);
  }
  return [...byDay.entries()].sort().map(([date, v]) => ({
    date,
    meanUGyPerHour: Number(mean(v).toFixed(3)),
    maxUGyPerHour: Number(Math.max(...v).toFixed(2)),
    mGyPerDay: Number(((mean(v) * 24) / 1000).toFixed(4)),
    n: v.length,
  }));
}

async function donkiSnapshot() {
  const { fetchSpaceWeather } = await import('../lib/spaceWeather.js');
  const recent = await fetchSpaceWeather({ days: 30 });
  const may2024 = await fetchSpaceWeather({ days: 30, now: new Date('2024-05-31T23:59:00Z') });
  fs.writeFileSync(
    path.join(OUT, 'donki-snapshot.json'),
    JSON.stringify({ ...recent, live: false, snapshotOf: 'last 30 days at retrieval', may2024: { range: may2024.range, sep: may2024.sep, flares: may2024.flares } }, null, 1),
  );
  console.log(`DONKI snapshot: ${recent.sep.length} SEP / ${recent.flares.length} flares (last 30 d); May 2024: ${may2024.sep.length} SEP / ${may2024.flares.length} flares`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await donkiSnapshot();
  if (process.argv.includes('--donki-only')) return;
  const retrieved = new Date().toISOString();

  // 1. Curiosity (MSL RAD) on the Mars surface, around the 20 May 2024 solar storm.
  const mars = await radlab('celestial_body=Mars&timestamp>=2024-05-14T00:00&timestamp<2024-05-27T00:00');
  const marsDaily = daily(mars.rows);
  const before = marsDaily.filter((d) => d.date >= '2024-05-14' && d.date <= '2024-05-19');
  const baseline = mean(before.map((d) => d.meanUGyPerHour));
  const peakDay = marsDaily.reduce((a, b) => (b.meanUGyPerHour > a.meanUGyPerHour ? b : a));
  fs.writeFileSync(
    path.join(OUT, 'radlab-msl-mars-may2024.json'),
    JSON.stringify(
      {
        title: 'Curiosity RAD, Mars surface, 14–26 May 2024 (solar storm on 20 May 2024)',
        instrument: [...new Set(mars.rows.map((r) => r.instrument_id))].join(', '),
        source: 'NASA OSDR RadLab',
        sourceUrl: mars.url,
        retrieved,
        units: { uGyPerHour: 'absorbed dose rate, µGy/hour (RadLab)', mGyPerDay: 'derived: mean µGy/h × 24 / 1000' },
        summary: {
          baselineUGyPerHour: Number(baseline.toFixed(2)),
          peakDay: peakDay.date,
          peakDayMeanUGyPerHour: peakDay.meanUGyPerHour,
          peakDayMaxUGyPerHour: peakDay.maxUGyPerHour,
          peakDayTimesBaseline: Number((peakDay.meanUGyPerHour / baseline).toFixed(1)),
        },
        daily: marsDaily,
        hourly: hourly(mars.rows),
      },
      null,
      1,
    ),
  );
  console.log(`Mars May 2024: ${mars.rows.length} rows; peak ${peakDay.date} = ${(peakDay.meanUGyPerHour / baseline).toFixed(1)}× baseline`);

  // 2. Reference days for other environments (absorbed dose rate, µGy/h).
  const refs = [
    { id: 'iss', label: 'ISS (DosTel, Columbus module)', query: 'spacecraft=ISS&timestamp>=2024-05-15T00:00&timestamp<2024-05-16T00:00' },
    { id: 'lunar-orbit', label: 'Lunar orbit (LRO CRaTER)', query: 'trajectory=BLEO&timestamp>=2012-03-01T00:00&timestamp<2012-03-02T00:00' },
  ];
  const out = [];
  for (const ref of refs) {
    try {
      const { url, rows } = await radlab(ref.query);
      const byInst = {};
      for (const r of rows) if (r.absorbed_dose_rate != null) (byInst[r.instrument_id] ??= []).push(r.absorbed_dose_rate);
      for (const [inst, v] of Object.entries(byInst)) {
        out.push({ id: `${ref.id}-${inst}`, label: ref.label, instrument: inst, date: ref.query.match(/>=(\d{4}-\d{2}-\d{2})/)[1], meanUGyPerHour: Number(mean(v).toFixed(2)), mGyPerDay: Number(((mean(v) * 24) / 1000).toFixed(3)), n: v.length, sourceUrl: url });
      }
      console.log(`${ref.label}: ${rows.length} rows`);
    } catch (e) {
      console.warn(`Skipped ${ref.label}: ${e.message}`);
    }
  }
  const marsQuiet = { id: 'mars-surface-MSL-RAD', label: 'Mars surface (Curiosity RAD), quiet days 14–19 May 2024', instrument: 'MSL-RAD-Surface', date: '2024-05-14/2024-05-19', meanUGyPerHour: Number(baseline.toFixed(2)), mGyPerDay: Number(((baseline * 24) / 1000).toFixed(3)), n: before.reduce((s, d) => s + d.n, 0), sourceUrl: mars.url };
  fs.writeFileSync(path.join(OUT, 'radlab-reference.json'), JSON.stringify({ source: 'NASA OSDR RadLab', retrieved, units: 'absorbed dose rate (µGy/h); mGy/day derived', references: [...out, marsQuiet] }, null, 1));
  console.log(`Wrote ${OUT}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
