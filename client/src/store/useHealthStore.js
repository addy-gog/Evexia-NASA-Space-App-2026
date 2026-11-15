/**
 * Global state (Zustand).
 * - logs: timestamped log entries for the selected crew member (local cache;
 *   entries with `pending: true` are not yet confirmed by the ground API)
 * - telemetry: live wearable samples (last 2 h) + known devices
 * - status: the astronaut's current health status derived from the logs,
 *   including `indicators: { [id]: { value, severity } }`
 */
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { ENVIRONMENTS, DEFAULT_BASELINE, INDICATORS } from '../config/thresholds.js';
import { evaluateCurrent, sortLogs, DAY_MS } from '../lib/evaluate.js';
import { mostSevere } from '../lib/severity.js';
import { aggregateForSync, pruneSamples } from '../lib/telemetry.js';
import { api, newId } from '../lib/api.js';

export const CREW = [
  { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander' },
  { id: 'c2', name: 'Leo Marchetti', role: 'Pilot' },
  { id: 'c3', name: 'Mei Tanaka', role: 'Flight Engineer' },
  { id: 'c4', name: 'Sam Rivera', role: 'Mission Specialist' },
  { id: 'c5', name: 'Priya Nair', role: 'Science Officer (Crew Medical Officer)' },
];

const safeStorage = {
  getItem: (k) => {
    try { return window.localStorage.getItem(k); } catch { return null; }
  },
  setItem: (k, v) => {
    try { window.localStorage.setItem(k, v); } catch { /* ignore */ }
  },
  removeItem: (k) => {
    try { window.localStorage.removeItem(k); } catch { /* ignore */ }
  },
};

const isoDay = (offsetDays) => {
  const d = new Date(Date.now() + offsetDays * DAY_MS);
  return d.toISOString().slice(0, 10);
};

function derive(s, now = Date.now()) {
  const logs = s.logs.filter((l) => l.crewId === s.crewId);
  const ctx = {
    environment: s.environment,
    delaySeconds: s.delaySeconds,
    baselineMode: s.baselineMode,
    baseline: s.baseline,
    missionStart: s.missionStart,
    lastConference: s.lastConference,
    priorDose: s.priorDose,
  };
  const status = evaluateCurrent(logs, ctx, now);
  const indicators = Object.fromEntries(
    INDICATORS.map((m) => [m.id, status.results[m.id] ? { value: status.results[m.id].value, severity: status.results[m.id].severity } : null]),
  );
  return { crewLogs: sortLogs(logs), ctx, status, indicators, focus: mostSevere(status.results) };
}

const initial = {
  crewId: 'c1',
  environment: 'marsTransit',
  delaySeconds: ENVIRONMENTS.marsTransit.delaySeconds.default,
  baselineMode: false,
  baseline: { ...DEFAULT_BASELINE },
  missionStart: isoDay(-60),
  lastConference: isoDay(-18),
  priorDose: 0,
  logs: [],
  textSize: 'md',
  theme: 'dark', // 'dark' (default, deep space) or 'light'
  highContrast: false,
  reducedMotion: null,
  simpleView: false,
  autoSync: { enabled: false, minutes: 30 },
  syncWindowMinutes: 15,
  telemetryKey: '',
  apiOnline: null,
  loading: false,
  telemetry: { samples: [], devices: [], stream: 'disconnected', lastSyncAt: null },
  // Symptom notes saved from the assistant (with a recheck time). Server is the source of truth.
  symptomNotes: [],
  focusNonce: 0,
  toast: null,
  clock: Date.now(),
  // Session (from the HttpOnly cookie; never persisted in the browser)
  user: null,
  profile: null,
  sessionChecked: false,
};

export const useHealthStore = create(
  persist(
    (set, get) => {
      const update = (patch) =>
        set((s) => {
          const next = { ...s, ...patch };
          return { ...patch, ...derive(next, next.clock) };
        });
      return {
        ...initial,
        ...derive(initial),
        crew: CREW,

        tick: () => update({ clock: Date.now() }),

        // ---------- Session ----------
        applySession: (user, profile) => {
          set({ user, profile, sessionChecked: true });
          if (user?.role === 'astronaut' && user.crewId) {
            if (get().crewId !== user.crewId) update({ crewId: user.crewId, telemetry: { ...get().telemetry, samples: [], devices: [] } });
            get().loadLogs();
            get().loadSymptomNotes();
          }
        },
        login: async (username, password) => {
          const r = await api.login(username, password);
          get().applySession(r.user, r.crew);
          return r.user;
        },
        restoreSession: async () => {
          try {
            const r = await api.me();
            if (r.user) get().applySession(r.user, r.crew);
            else set({ user: null, profile: null, sessionChecked: true });
          } catch {
            set({ user: null, profile: null, sessionChecked: true });
          }
        },
        logout: async () => {
          await api.logout().catch(() => {});
          update({ user: null, profile: null, logs: [], symptomNotes: [], telemetry: { samples: [], devices: [], stream: 'disconnected', lastSyncAt: null } });
        },
        setCrew: (crewId) => {
          update({ crewId, symptomNotes: [], telemetry: { ...get().telemetry, samples: [], devices: [] } });
          get().loadLogs();
          get().loadSymptomNotes();
        },
        setEnvironment: (environment) => {
          if (!ENVIRONMENTS[environment]) return;
          update({ environment, delaySeconds: ENVIRONMENTS[environment].delaySeconds.default });
        },
        setDelaySeconds: (delaySeconds) => {
          const r = ENVIRONMENTS[get().environment].delaySeconds;
          update({ delaySeconds: Math.max(r.min, Math.min(r.max, delaySeconds)) });
        },
        setBaselineMode: (baselineMode) => update({ baselineMode }),
        setBaseline: (baseline) => {
          update({ baseline: { ...get().baseline, ...baseline } });
          api.putBaseline(get().crewId, baseline).catch(() => {});
        },
        setMission: (patch) => update(patch), // missionStart, lastConference, priorDose
        setTextSize: (textSize) => set({ textSize }),
        setHighContrast: (highContrast) => set({ highContrast }),
        setTheme: (theme) => set({ theme: theme === 'light' ? 'light' : 'dark' }),
        setReducedMotion: (reducedMotion) => set({ reducedMotion }),
        setSimpleView: (simpleView) => set({ simpleView }),
        setAutoSync: (autoSync) => set({ autoSync: { ...get().autoSync, ...autoSync } }),
        setSyncWindow: (syncWindowMinutes) => set({ syncWindowMinutes }),
        setTelemetryKey: (telemetryKey) => set({ telemetryKey }),
        setApiOnline: (apiOnline) => set({ apiOnline }),
        showToast: (message, tone = 'info') => set({ toast: { message, tone, id: Date.now() } }),
        clearToast: () => set({ toast: null }),

        // ---------- Log entries ----------
        /** Add a timestamped log entry. Returns the entry. */
        addLog: (values, { ts = new Date().toISOString(), notes = '', source = 'manual', device = 'Manual entry', spe = false } = {}) => {
          const s = get();
          const entry = { id: newId(), crewId: s.crewId, ts, ...values, spe: Boolean(spe), environment: s.environment, source, device, notes: notes.trim(), pending: true };
          update({ logs: [...s.logs, entry], focusNonce: s.focusNonce + 1, clock: Date.now() });
          get().pushLog(entry);
          return entry;
        },
        pushLog: async (entry) => {
          const { pending: _p, ...body } = entry;
          try {
            await api.postReading(body);
            update({ logs: get().logs.map((l) => (l.id === entry.id ? { ...l, pending: false } : l)), apiOnline: true });
          } catch (err) {
            if (err.status === 400) {
              get().showToast(`Ground rejected log entry: ${Object.values(err.data?.details || {}).join(' ')}`, 'warn');
              update({ logs: get().logs.map((l) => (l.id === entry.id ? { ...l, pending: false, rejected: true } : l)) });
            } else set({ apiOnline: false });
          }
        },
        deleteLog: async (id) => {
          const s = get();
          update({ logs: s.logs.filter((l) => l.id !== id) });
          try {
            await api.deleteReading(id, s.crewId);
          } catch {
            /* offline or already gone */
          }
        },
        /** Fetch the last 90 days from the ground and merge with local (pending) entries. */
        loadLogs: async () => {
          const crewId = get().crewId;
          set({ loading: true });
          try {
            const res = await api.readings(crewId, new Date(Date.now() - 90 * DAY_MS).toISOString());
            const local = get().logs.filter((l) => l.crewId !== crewId || l.pending);
            const ids = new Set(local.map((l) => l.id));
            update({ logs: [...local, ...res.readings.filter((r) => !ids.has(r.id))], apiOnline: true, loading: false });
            for (const p of local.filter((l) => l.pending && l.crewId === crewId)) get().pushLog(p);
          } catch (err) {
            if (err.status === 401) set({ user: null, loading: false });
            else set({ apiOnline: false, loading: false });
          }
        },

        // ---------- Symptom notes ----------
        loadSymptomNotes: async () => {
          const crewId = get().crewId;
          try {
            const res = await api.symptomNotes(crewId);
            if (get().crewId === crewId) set({ symptomNotes: res.notes });
          } catch {
            /* offline: keep what we have */
          }
        },
        /** Save a note the astronaut confirmed. Returns the saved note, or throws if the ground rejects it. */
        addSymptomNote: async ({ summary, details = '', recheckHours = null }) => {
          const saved = await api.postSymptomNote({ id: newId(), crewId: get().crewId, ts: new Date().toISOString(), summary, details, recheckHours });
          set({ symptomNotes: [saved, ...get().symptomNotes.filter((n) => n.id !== saved.id)] });
          return saved;
        },
        setSymptomNoteStatus: async (id, status) => {
          const before = get().symptomNotes;
          set({ symptomNotes: before.map((n) => (n.id === id ? { ...n, status } : n)) });
          try {
            await api.patchSymptomNote(id, { status });
          } catch {
            set({ symptomNotes: before });
            get().showToast('Could not update the note. Check the ground link and try again.', 'warn');
          }
        },

        // ---------- Telemetry ----------
        addSamples: (samples) => {
          const t = get().telemetry;
          const key = (x) => `${x.deviceId}|${x.metric}|${x.ts}`;
          const seen = new Set(t.samples.map(key));
          const fresh = samples.filter((x) => !seen.has(key(x)));
          if (!fresh.length) return;
          set({ telemetry: { ...t, samples: pruneSamples([...t.samples, ...fresh]) } });
        },
        setDevices: (devices) => set({ telemetry: { ...get().telemetry, devices } }),
        setStreamState: (stream) => set({ telemetry: { ...get().telemetry, stream } }),
        /** Preview of what "Sync to log" would write. */
        syncPreview: (windowMinutes = get().syncWindowMinutes) => aggregateForSync(get().telemetry.samples.filter((x) => x.crewId === get().crewId), windowMinutes * 60_000),
        /** Write the aggregated telemetry window as a log entry. */
        syncTelemetryToLog: (windowMinutes = get().syncWindowMinutes) => {
          const agg = get().syncPreview(windowMinutes);
          if (!agg) return null;
          const entry = get().addLog(agg.values, { ts: agg.to, notes: agg.notes, source: 'wearable', device: agg.devices.join(', ') });
          set({ telemetry: { ...get().telemetry, lastSyncAt: new Date().toISOString() } });
          return entry;
        },

        resetSettings: () => update({ ...initial, logs: get().logs, crewId: get().crewId }),
        clearLocalLogs: () => update({ logs: [] }),
      };
    },
    {
      name: 'evexia-v2',
      storage: createJSONStorage(() => safeStorage),
      partialize: (s) => ({
        crewId: s.crewId,
        environment: s.environment,
        delaySeconds: s.delaySeconds,
        baselineMode: s.baselineMode,
        baseline: s.baseline,
        missionStart: s.missionStart,
        lastConference: s.lastConference,
        priorDose: s.priorDose,
        logs: s.logs.slice(-3000),
        textSize: s.textSize,
        theme: s.theme,
        highContrast: s.highContrast,
        reducedMotion: s.reducedMotion,
        simpleView: s.simpleView,
        autoSync: s.autoSync,
        syncWindowMinutes: s.syncWindowMinutes,
        telemetryKey: s.telemetryKey,
      }),
      merge: (persisted, current) => {
        const next = { ...current, ...(persisted || {}), clock: Date.now() };
        if (!ENVIRONMENTS[next.environment]) next.environment = 'marsTransit';
        return { ...next, ...derive(next) };
      },
    },
  ),
);

export function usePrefersReducedMotion() {
  const setting = useHealthStore((s) => s.reducedMotion);
  if (setting !== null) return setting;
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
