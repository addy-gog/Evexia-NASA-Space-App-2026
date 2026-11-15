import { Suspense, lazy, useEffect } from 'react';
import { Routes, Route, Link, Navigate, useLocation } from 'react-router-dom';
import Layout from './components/Layout.jsx';
import SurgeonLayout from './components/SurgeonLayout.jsx';
import Login from './routes/Login.jsx';
import Dashboard from './routes/Dashboard.jsx';
import LogReadings from './routes/LogReadings.jsx';
import Alerts from './routes/Alerts.jsx';
import Guide from './routes/Guide.jsx';
import Settings from './routes/Settings.jsx';
import Credits from './routes/Credits.jsx';
import Emergency from './routes/Emergency.jsx';
import Telemetry from './routes/Telemetry.jsx';
import { LogoMark } from './components/Brand.jsx';
import SpaceBackground from './components/SpaceBackground.jsx';
import PWAInstallBanner from './components/PWAInstallBanner.jsx';
import { useHealthStore } from './store/useHealthStore.js';
import { useTelemetryStream, useAutoSync } from './hooks/useTelemetry.js';
import { api } from './lib/api.js';
import { flushOutbox, requestPersistence } from './lib/outbox.js';

// Chart-heavy and ground-side pages load on demand.
const History = lazy(() => import('./routes/History.jsx'));
const NasaData = lazy(() => import('./routes/NasaData.jsx'));
const BodyPage = lazy(() => import('./routes/BodyPage.jsx'));
const Comms = lazy(() => import('./routes/Comms.jsx'));
const SurgeonOverview = lazy(() => import('./routes/surgeon/Overview.jsx'));
const CrewDetail = lazy(() => import('./routes/surgeon/CrewDetail.jsx'));
const SurgeonEscalations = lazy(() => import('./routes/surgeon/Escalations.jsx'));

function useDocumentSettings() {
  const textSize = useHealthStore((s) => s.textSize);
  const highContrast = useHealthStore((s) => s.highContrast);
  const reducedMotion = useHealthStore((s) => s.reducedMotion);
  const theme = useHealthStore((s) => s.theme);
  useEffect(() => {
    const el = document.documentElement;
    el.dataset.textSize = textSize;
    el.dataset.theme = theme === 'light' ? 'light' : 'dark';
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'light' ? '#EEF2F8' : '#050A18');
    el.dataset.contrast = highContrast ? 'high' : 'normal';
    if (reducedMotion === null) delete el.dataset.reducedMotion;
    else el.dataset.reducedMotion = String(reducedMotion);
  }, [textSize, highContrast, reducedMotion, theme]);
}

/** Keep the Earth link state (up or blackout, reports waiting) fresh for signed-in crew. */
function useEarthLinkMonitor() {
  const role = useHealthStore((s) => s.user?.role);
  useEffect(() => {
    if (role !== 'astronaut') return undefined;
    const load = () => useHealthStore.getState().loadEarthLink();
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, [role]);
}

function useConnectionMonitor() {
  const setApiOnline = useHealthStore((s) => s.setApiOnline);
  useEffect(() => {
    requestPersistence(); // ask the browser not to clear the outbox when space runs low
  }, []);
  useEffect(() => {
    let alive = true;
    const ping = () =>
      api
        .health()
        .then(() => {
          if (!alive) return;
          const s = useHealthStore.getState();
          const wasOffline = s.apiOnline === false;
          setApiOnline(true);
          // Send anything kept on this device while the onboard server was unreachable.
          flushOutbox(api).then((r) => {
            if (r.reports || r.logs) useHealthStore.getState().loadEarthLink();
          });
          if (wasOffline && s.user?.role === 'astronaut') s.loadLogs(); // flush pending entries
        })
        .catch(() => alive && setApiOnline(false));
    ping();
    const id = setInterval(ping, 30000);
    window.addEventListener('online', ping);
    return () => {
      alive = false;
      clearInterval(id);
      window.removeEventListener('online', ping);
    };
  }, [setApiOnline]);
}

/** Restore the session from the cookie, and keep "now"-based status fresh. */
function useSessionAndClock() {
  useEffect(() => {
    useHealthStore.getState().restoreSession();
    const id = setInterval(() => useHealthStore.getState().tick(), 30_000);
    return () => clearInterval(id);
  }, []);
}

function Splash() {
  return (
    <div className="flex min-h-screen items-center justify-center gap-3 text-ink-3" role="status">
      <LogoMark size={40} /> Connecting to Evexia…
    </div>
  );
}

/** Only signed-in users with this role; others go to sign-in or to their own home. */
function RequireRole({ role, children }) {
  const user = useHealthStore((s) => s.user);
  const checked = useHealthStore((s) => s.sessionChecked);
  const location = useLocation();
  if (!checked) return <Splash />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'surgeon' ? '/surgeon' : '/'} replace />;
  return children;
}

function NotFound() {
  const user = useHealthStore((s) => s.user);
  return (
    <div className="hud-panel mx-auto max-w-xl text-center">
      <h1 className="page-title">Page not found</h1>
      <p className="mt-2 text-ink-3">That screen does not exist.</p>
      <Link to={user?.role === 'surgeon' ? '/surgeon' : '/'} className="btn-primary mt-4">Back to {user?.role === 'surgeon' ? 'crew overview' : 'console'}</Link>
    </div>
  );
}

const Loading = () => <p className="p-6 text-ink-3" role="status">Loading…</p>;
const lazyEl = (C) => (
  <Suspense fallback={<Loading />}>
    <C />
  </Suspense>
);

export default function App() {
  useDocumentSettings();
  useConnectionMonitor();
  useEarthLinkMonitor();
  useSessionAndClock();
  useTelemetryStream();
  useAutoSync();
  const checked = useHealthStore((s) => s.sessionChecked);
  return (
    <>
    <SpaceBackground />
    <PWAInstallBanner />
    <Routes>
      <Route path="login" element={checked ? <Login /> : <Splash />} />
      <Route
        path="surgeon"
        element={
          <RequireRole role="surgeon">
            <SurgeonLayout />
          </RequireRole>
        }
      >
        <Route index element={lazyEl(SurgeonOverview)} />
        <Route path="crew/:id" element={lazyEl(CrewDetail)} />
        <Route path="escalations" element={lazyEl(SurgeonEscalations)} />
        <Route path="data" element={lazyEl(NasaData)} />
        <Route path="credits" element={<Credits />} />
        <Route path="*" element={<NotFound />} />
      </Route>
      <Route
        element={
          <RequireRole role="astronaut">
            <Layout />
          </RequireRole>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="log" element={<LogReadings />} />
        <Route path="body" element={lazyEl(BodyPage)} />
        <Route path="history" element={lazyEl(History)} />
        <Route path="telemetry" element={<Telemetry />} />
        <Route path="alerts" element={<Alerts />} />
        <Route path="guide" element={<Guide />} />
        <Route path="emergency" element={<Emergency />} />
        <Route path="comms" element={lazyEl(Comms)} />
        <Route path="data" element={lazyEl(NasaData)} />
        <Route path="settings" element={<Settings />} />
        <Route path="credits" element={<Credits />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
    </>
  );
}
