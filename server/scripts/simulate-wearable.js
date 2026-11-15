/**
 * Wearable gateway simulator (developer / test tool, NOT shown in the app).
 * Sends realistic samples to POST /api/telemetry exactly like a real device
 * gateway would, so the live telemetry screen can be tried without hardware.
 *
 *   npm run telemetry:sim -- --crew c1 --url http://localhost:8787 --minutes 5
 *   options: --crew, --url, --minutes, --key (x-telemetry-key), --hr <bpm>, --once
 */
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, a, i, all) => {
    if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true]);
    return acc;
  }, []),
);
const url = String(args.url || process.env.EVEXIA_URL || 'http://localhost:8787').replace(/\/$/, '');
const crewId = String(args.crew || 'c1');
const minutes = Number(args.minutes || 5);
const key = args.key || process.env.TELEMETRY_KEY || '';
let hr = Number(args.hr || 68);

async function send(deviceId, deviceName, samples) {
  const res = await fetch(`${url}/api/telemetry`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-telemetry-key': key } : {}) },
    body: JSON.stringify({ crewId, deviceId, deviceName, kind: 'gateway', samples }),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
}

async function tick(i) {
  const now = new Date().toISOString();
  hr = Math.max(48, Math.min(110, hr + (Math.random() - 0.5) * 3));
  await send('sim-watch-01', 'Simulated smartwatch (gateway)', [{ metric: 'hr', value: Math.round(hr), ts: now }]);
  if (i % 30 === 0) await send('sim-thermo-01', 'Simulated thermometer patch', [{ metric: 'temp', value: Number((36.6 + Math.random() * 0.3).toFixed(1)), ts: now }]);
  if (i % 60 === 0) await send('sim-bp-01', 'Simulated BP cuff', [{ metric: 'sys', value: 117 + Math.round(Math.random() * 6), ts: now }, { metric: 'dia', value: 75 + Math.round(Math.random() * 4), ts: now }]);
  if (i % 120 === 0) await send('sim-dosimeter-01', 'Simulated active dosimeter', [{ metric: 'radiation', value: Number((0.46 + Math.random() * 0.04).toFixed(3)), ts: now }]);
}

console.log(`Simulating wearables for crew ${crewId} → ${url}/api/telemetry for ${minutes} min (Ctrl+C to stop)`);
let i = 0;
await tick(i);
if (!args.once) {
  const timer = setInterval(async () => {
    i += 1;
    try {
      await tick(i);
    } catch (e) {
      console.error(e.message);
    }
    if (i * 2 >= minutes * 60) {
      clearInterval(timer);
      console.log('Done.');
    }
  }, 2000);
}
