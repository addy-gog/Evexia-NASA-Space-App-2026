import { useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { TELEMETRY_METRICS } from '../config/thresholds.js';
import { BLE_PROFILES } from '../lib/telemetry.js';
import { bluetoothSupport, connectBluetooth } from '../lib/bluetooth.js';
import { evaluateReading } from '../lib/severity.js';
import { api, API_BASE } from '../lib/api.js';
import { formatTime, relativeTime, formatDose } from '../lib/format.js';
import Sparkline from '../components/Sparkline.jsx';
import { StatusBadge, SEVERITY_META } from '../components/Status.jsx';

const LIVE_METRICS = ['spo2', 'hr', 'sys', 'dia', 'temp', 'glucose', 'radiation', 'sleep'];
const STREAM_TEXT = {
  live: ['Live', 'text-ok-fg'],
  connecting: ['Connecting…', 'text-ink-3'],
  reconnecting: ['Reconnecting…', 'text-warn-fg'],
  disconnected: ['Not connected', 'text-warn-fg'],
};

function severityFor(metric, value, latest, environment) {
  if (metric === 'sys' || metric === 'dia') {
    const sys = metric === 'sys' ? value : latest.sys?.value;
    const dia = metric === 'dia' ? value : latest.dia?.value;
    if (sys == null || dia == null) return null;
    return evaluateReading({ sys, dia }).bp?.severity ?? null;
  }
  const r = evaluateReading({ [metric]: value }, { environment });
  return r[metric]?.severity ?? null;
}

function LiveTile({ metric, samples, latest, environment, now }) {
  const meta = TELEMETRY_METRICS[metric];
  const last = latest[metric];
  const series = samples.filter((s) => s.metric === metric && now - new Date(s.ts).getTime() < 15 * 60_000).map((s) => s.value);
  const sev = last ? severityFor(metric, last.value, latest, environment) : null;
  const fmt = (v) => (metric === 'radiation' ? formatDose(v) : metric === 'temp' ? Number(v).toFixed(1) : Math.round(v * 10) / 10);
  return (
    <article className={`hud-panel border-l-4 ${sev ? SEVERITY_META[sev].border : 'border-line'}`} data-testid={`live-${metric}`} data-severity={sev ?? 'none'}>
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-3">{meta.label}</h3>
        {sev && <StatusBadge severity={sev} compact />}
      </div>
      {last ? (
        <>
          <div className="mt-1 flex items-end justify-between gap-2">
            <p>
              <span className="num text-3xl font-bold" data-testid={`live-value-${metric}`}>{fmt(last.value)}</span> <span className="text-sm text-ink-3">{meta.unit}</span>
            </p>
            <Sparkline values={series} lastColor={sev ? SEVERITY_META[sev].color : undefined} />
          </div>
          <p className="mt-1 text-xs text-ink-3">
            {formatTime(last.ts)} · {relativeTime(last.ts, now)} · {last.deviceName}
          </p>
        </>
      ) : (
        <p className="mt-2 text-sm text-ink-3">Waiting for data…</p>
      )}
    </article>
  );
}

function BluetoothPanel() {
  const crewId = useHealthStore((s) => s.crewId);
  const telemetryKey = useHealthStore((s) => s.telemetryKey);
  const addSamples = useHealthStore((s) => s.addSamples);
  const showToast = useHealthStore((s) => s.showToast);
  const [connected, setConnected] = useState({});
  const [busy, setBusy] = useState(null);
  const handles = useRef({});
  const support = bluetoothSupport();

  const connect = async (key) => {
    setBusy(key);
    try {
      const h = await connectBluetooth(
        key,
        (samples, device) => {
          const full = samples.map((s) => ({ ...s, crewId, deviceId: `ble-${device.id}`, deviceName: device.name }));
          addSamples(full);
          api.postTelemetry({ crewId, deviceId: `ble-${device.id}`, deviceName: device.name, kind: 'bluetooth', samples }, telemetryKey).catch(() => {});
        },
        (device) => {
          setConnected((c) => ({ ...c, [key]: null }));
          showToast(`${device.name} disconnected.`, 'warn');
        },
      );
      handles.current[key] = h;
      setConnected((c) => ({ ...c, [key]: h.device }));
      showToast(`Connected to ${h.device.name}. Streaming live.`, 'ok');
    } catch (err) {
      if (err?.name !== 'NotFoundError') showToast(`Bluetooth: ${err?.message || 'connection failed'}`, 'warn');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="hud-panel" aria-labelledby="ble-h" data-testid="bluetooth-panel">
      <h2 id="ble-h" className="text-lg font-bold">Connect a wearable (Bluetooth)</h2>
      <p className="mt-1 text-sm text-ink-3">
        Pairs directly with devices that use the standard Bluetooth health profiles: heart-rate straps and watches in heart-rate broadcast mode, clinical thermometers and blood-pressure cuffs.
      </p>
      {!support.supported && (
        <p className="mt-2 rounded border border-warn-dot p-2 text-sm text-warn-fg" role="note" data-testid="ble-unsupported">
          {support.reason}
        </p>
      )}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {Object.entries(BLE_PROFILES).map(([key, p]) => (
          <div key={key} className="rounded border border-line p-3">
            <p className="font-semibold">{p.label}</p>
            <p className="text-xs text-ink-3">GATT service 0x{p.service.toString(16).toUpperCase()}</p>
            {connected[key] ? (
              <div className="mt-2 flex items-center gap-2">
                <span className="text-sm text-ok-fg">● {connected[key].name}</span>
                <button type="button" className="btn-ghost ml-auto py-1 text-sm" onClick={() => { handles.current[key]?.disconnect(); setConnected((c) => ({ ...c, [key]: null })); }}>
                  Disconnect
                </button>
              </div>
            ) : (
              <button type="button" className="btn-primary mt-2 w-full" disabled={!support.supported || busy === key} onClick={() => connect(key)}>
                {busy === key ? 'Pairing…' : 'Pair device'}
              </button>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function GatewayPanel({ devices, now }) {
  const crewId = useHealthStore((s) => s.crewId);
  const origin = API_BASE || (typeof window !== 'undefined' ? window.location.origin : '');
  const example = `curl -X POST ${origin}/api/telemetry \\
  -H "Content-Type: application/json" \\
  -H "x-telemetry-key: <TELEMETRY_KEY if set>" \\
  -d '{"crewId":"${crewId}","deviceId":"watch-01","deviceName":"Crew smartwatch",
       "samples":[{"metric":"hr","value":72,"ts":"${new Date(now).toISOString().slice(0, 19)}Z"}]}'`;
  return (
    <section className="hud-panel" aria-labelledby="gw-h">
      <h2 id="gw-h" className="text-lg font-bold">Device gateway (real-time API)</h2>
      <p className="mt-1 text-sm text-ink-3">
        Watches, rings, patches and dosimeters that sync through a phone or habitat gateway can push samples to Evexia in real time. Accepted metrics: {Object.keys(TELEMETRY_METRICS).join(', ')} (radiation in mGy/day absorbed dose).
      </p>
      <pre className="mt-2 overflow-x-auto rounded border border-line bg-bg p-3 font-mono text-xs" tabIndex={0} aria-label="Example gateway request">{example}</pre>
      <h3 className="mt-3 font-semibold">Devices seen</h3>
      {devices.length === 0 ? (
        <p className="text-sm text-ink-3" data-testid="no-devices">No devices have sent data yet.</p>
      ) : (
        <ul className="mt-1 space-y-1 text-sm" data-testid="device-list">
          {devices.map((d) => (
            <li key={d.deviceId} className="flex flex-wrap items-center gap-2">
              <span className={now - new Date(d.lastSeen).getTime() < 120_000 ? 'text-ok-fg' : 'text-ink-3'} aria-hidden="true">●</span>
              <span className="font-semibold">{d.deviceName}</span>
              <span className="text-ink-3">({d.kind}) · last seen {relativeTime(d.lastSeen, now)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function SyncPanel({ now }) {
  const windowMin = useHealthStore((s) => s.syncWindowMinutes);
  const setWindow = useHealthStore((s) => s.setSyncWindow);
  const autoSync = useHealthStore((s) => s.autoSync);
  const setAutoSync = useHealthStore((s) => s.setAutoSync);
  const lastSyncAt = useHealthStore((s) => s.telemetry.lastSyncAt);
  const samples = useHealthStore((s) => s.telemetry.samples);
  const syncPreview = useHealthStore((s) => s.syncPreview);
  const sync = useHealthStore((s) => s.syncTelemetryToLog);
  const showToast = useHealthStore((s) => s.showToast);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const preview = useMemo(() => syncPreview(windowMin), [samples, windowMin, now]);

  return (
    <section className="hud-panel border-accent" aria-labelledby="sync-h" data-testid="sync-panel">
      <h2 id="sync-h" className="text-lg font-bold">Sync to log and evaluation</h2>
      <p className="mt-1 text-sm text-ink-3">Turns the live window into a timestamped log entry, which updates the health status, body display, score and alerts.</p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          Window
          <select className="field w-auto py-1 font-sans text-base" value={windowMin} onChange={(e) => setWindow(Number(e.target.value))} data-testid="sync-window">
            {[5, 15, 30, 60].map((m) => (
              <option key={m} value={m}>last {m} min</option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="btn-primary"
          disabled={!preview}
          data-testid="sync-now"
          onClick={() => {
            const e = sync(windowMin);
            if (e) showToast(`Synced to log at ${formatTime(e.ts)}.`, 'ok');
          }}
        >
          Sync to log now
        </button>
        <label className="flex min-h-touch items-center gap-2 text-sm">
          <input type="checkbox" className="h-5 w-5 accent-[#FF4D55]" checked={autoSync.enabled} onChange={(e) => setAutoSync({ enabled: e.target.checked })} data-testid="auto-sync" />
          Auto-sync every
        </label>
        <select className="field w-auto py-1 font-sans text-base" aria-label="Auto-sync interval" value={autoSync.minutes} onChange={(e) => setAutoSync({ minutes: Number(e.target.value) })}>
          {[15, 30, 60].map((m) => (
            <option key={m} value={m}>{m} min</option>
          ))}
        </select>
      </div>
      <div className="mt-3 rounded border border-line bg-bg p-3 text-sm" data-testid="sync-preview" aria-live="polite">
        {preview ? (
          <>
            <p className="font-semibold">Will log: {Object.entries(preview.values).map(([m, v]) => `${TELEMETRY_METRICS[m].label} ${m === 'radiation' ? formatDose(v) : v} ${TELEMETRY_METRICS[m].unit}`).join(' · ')}</p>
            <p className="mt-1 text-ink-3">{preview.notes}</p>
          </>
        ) : (
          <p className="text-ink-3">No telemetry in the selected window yet.</p>
        )}
      </div>
      {lastSyncAt && <p className="mt-2 text-xs text-ink-3">Last sync {formatTime(lastSyncAt)} ({relativeTime(lastSyncAt, now)}).</p>}
    </section>
  );
}

export default function Telemetry() {
  const samples = useHealthStore((s) => s.telemetry.samples);
  const devices = useHealthStore((s) => s.telemetry.devices);
  const stream = useHealthStore((s) => s.telemetry.stream);
  const crewId = useHealthStore((s) => s.crewId);
  const environment = useHealthStore((s) => s.environment);
  const now = useHealthStore((s) => s.clock);
  const crewSamples = useMemo(() => samples.filter((x) => x.crewId === crewId), [samples, crewId]);
  const latest = useMemo(() => {
    const out = {};
    for (const s of crewSamples) if (!out[s.metric] || new Date(s.ts) >= new Date(out[s.metric].ts)) out[s.metric] = s;
    return out;
  }, [crewSamples]);
  const [label, cls] = STREAM_TEXT[stream] ?? STREAM_TEXT.disconnected;
  const shown = LIVE_METRICS.filter((m) => latest[m] || ['hr', 'sys', 'dia', 'temp'].includes(m));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Live telemetry</h1>
        <p className={`text-sm font-semibold ${cls}`} role="status" data-testid="stream-status" data-stream={stream}>
          ● Stream: {label}
        </p>
        <Link to="/" className="btn-ghost ml-auto">View health status</Link>
      </div>
      <p className="text-sm text-ink-3">Real-time readings from wearables and on-board devices. Values here are live samples; sync them to the log to include them in the health evaluation.</p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" data-testid="live-grid">
        {shown.map((m) => (
          <LiveTile key={m} metric={m} samples={crewSamples} latest={latest} environment={environment} now={now} />
        ))}
      </div>
      <SyncPanel now={now} />
      <div className="grid gap-4 xl:grid-cols-2">
        <BluetoothPanel />
        <GatewayPanel devices={devices} now={now} />
      </div>
    </div>
  );
}
