import { useEffect } from 'react';
import { useHealthStore } from '../store/useHealthStore.js';
import { api } from '../lib/api.js';

/**
 * App-level live telemetry:
 * - loads the last 2 h of samples and the device list,
 * - subscribes to the server's Server-Sent Events stream (samples + new log entries),
 * - runs auto-sync (telemetry → log) when enabled.
 */
export function useTelemetryStream() {
  const crewId = useHealthStore((s) => (s.user?.role === 'astronaut' ? s.user.crewId : null));

  useEffect(() => {
    if (!crewId) return undefined;
    const st = useHealthStore.getState();
    let alive = true;
    const loadLatest = () =>
      api
        .telemetryLatest(crewId)
        .then((r) => alive && useHealthStore.getState().setDevices(r.devices))
        .catch(() => {});
    api
      .telemetry(crewId, new Date(Date.now() - 2 * 3_600_000).toISOString())
      .then((r) => alive && useHealthStore.getState().addSamples(r.samples))
      .catch(() => {});
    loadLatest();
    const devTimer = setInterval(loadLatest, 30_000);

    let es = null;
    if (typeof EventSource !== 'undefined') {
      st.setStreamState('connecting');
      es = new EventSource(api.streamUrl(crewId), { withCredentials: true });
      es.addEventListener('hello', () => useHealthStore.getState().setStreamState('live'));
      es.addEventListener('sample', (e) => {
        try {
          const sample = JSON.parse(e.data);
          const st2 = useHealthStore.getState();
          if (!st2.telemetry.devices.some((d) => d.deviceId === sample.deviceId)) loadLatest(); // new device: refresh list now
          st2.addSamples([sample]);
        } catch {
          /* ignore malformed event */
        }
      });
      es.addEventListener('reading', () => {
        // Another device (or a gateway) added a log entry: refresh from the ground.
        useHealthStore.getState().loadLogs();
      });
      es.onerror = () => useHealthStore.getState().setStreamState('reconnecting');
    }
    return () => {
      alive = false;
      clearInterval(devTimer);
      es?.close();
      useHealthStore.getState().setStreamState('disconnected');
    };
  }, [crewId]);
}

/** Periodically writes new telemetry to the log when auto-sync is on. */
export function useAutoSync() {
  const enabled = useHealthStore((s) => s.autoSync.enabled);
  const minutes = useHealthStore((s) => s.autoSync.minutes);
  useEffect(() => {
    if (!enabled) return undefined;
    const id = setInterval(() => {
      const s = useHealthStore.getState();
      const last = s.telemetry.lastSyncAt ? new Date(s.telemetry.lastSyncAt).getTime() : 0;
      const hasNew = s.telemetry.samples.some((x) => x.crewId === s.crewId && new Date(x.ts).getTime() > last);
      if (hasNew && s.syncTelemetryToLog(minutes)) s.showToast('Auto-sync: wearable telemetry added to the log.', 'ok');
    }, minutes * 60_000);
    return () => clearInterval(id);
  }, [enabled, minutes]);
}
