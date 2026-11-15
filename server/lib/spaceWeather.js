/**
 * Live solar activity from NASA CCMC DONKI (no API key needed):
 *   https://ccmc.gsfc.nasa.gov/DONKI/WS/get/SEP?startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
 *   https://ccmc.gsfc.nasa.gov/DONKI/WS/get/FLR?startDate=...&endDate=...
 * Cached for 15 minutes; falls back to the bundled snapshot when offline.
 * CCMC notes real-time DONKI data is "prototyping quality and in research context".
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT = path.join(here, '..', 'data', 'nasa', 'donki-snapshot.json');
const BASE = process.env.DONKI_BASE_URL || 'https://ccmc.gsfc.nasa.gov/DONKI/WS/get';
const TTL = 15 * 60_000;
let cache = null;

const ymd = (d) => d.toISOString().slice(0, 10);

export function mapSep(e) {
  return {
    id: e.sepID,
    time: e.eventTime,
    instruments: (e.instruments || []).map((i) => i.displayName),
    link: e.link,
    linkedEvents: (e.linkedEvents || []).map((l) => l.activityID),
  };
}

export function mapFlare(e) {
  return {
    id: e.flrID,
    begin: e.beginTime,
    peak: e.peakTime,
    end: e.endTime,
    classType: e.classType,
    sourceLocation: e.sourceLocation,
    activeRegion: e.activeRegionNum,
    link: e.link,
  };
}

async function get(kind, start, end, fetchImpl) {
  const url = `${BASE}/${kind}?startDate=${ymd(start)}&endDate=${ymd(end)}`;
  const res = await fetchImpl(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`DONKI ${kind} HTTP ${res.status}`);
  const text = await res.text();
  return text.trim() ? JSON.parse(text) : [];
}

export async function fetchSpaceWeather({ days = 30, now = new Date(), fetchImpl = fetch } = {}) {
  const end = new Date(now);
  const start = new Date(end.getTime() - days * 86_400_000);
  const [sep, flr] = await Promise.all([get('SEP', start, end, fetchImpl), get('FLR', start, end, fetchImpl)]);
  return {
    source: 'NASA CCMC DONKI',
    sourceUrl: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    live: true,
    fetchedAt: new Date().toISOString(),
    range: { start: ymd(start), end: ymd(end) },
    sep: sep.map(mapSep).sort((a, b) => (a.time < b.time ? 1 : -1)),
    flares: flr.map(mapFlare).sort((a, b) => (a.peak < b.peak ? 1 : -1)),
  };
}

export function loadSnapshot() {
  try {
    return { ...JSON.parse(fs.readFileSync(SNAPSHOT, 'utf8')), live: false };
  } catch {
    return null;
  }
}

/** Cached live data, else the bundled snapshot. */
export async function getSpaceWeather({ fetchImpl = fetch, force = false } = {}) {
  if (!force && cache && Date.now() - cache.at < TTL) return cache.data;
  try {
    const data = await fetchSpaceWeather({ fetchImpl });
    cache = { at: Date.now(), data };
    return data;
  } catch (err) {
    const snap = loadSnapshot();
    if (snap) return { ...snap, error: `Live DONKI unavailable (${err.message}); showing bundled snapshot.` };
    throw err;
  }
}

export function clearSpaceWeatherCache() {
  cache = null;
}
