import { useEffect, useRef, useState } from 'react';
import { NavLink, Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { DISCLAIMER } from '../config/thresholds.js';
import { formatDelay } from '../lib/comms.js';
import AIDock from './ai/AIDock.jsx';
import Toast from './Toast.jsx';
import { Wordmark, Avatar } from './Brand.jsx';

const NAV = [
  { to: '/', label: 'Console', short: 'Console', icon: 'M3 12h4l3-8 4 16 3-8h4' },
  { to: '/log', label: 'Log Readings', short: 'Log', icon: 'M12 5v14M5 12h14' },
  { to: '/history', label: 'History', short: 'History', icon: 'M3 20h18M6 16l4-5 4 3 5-7' },
  { to: '/alerts', label: 'Guidance', short: 'Guidance', icon: 'M12 3l10 18H2zM12 10v4M12 17.5v.5' },
  // NASA Data sits in the main bar so judges and crew find the real data behind every threshold.
  { to: '/data', label: 'NASA Data', short: 'NASA', icon: 'M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18zM3 12h18M12 3c3 3.5 3 14.5 0 18M12 3c-3 3.5-3 14.5 0 18' },
];

function NavIcon({ d }) {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function TextSizeToggle() {
  const size = useHealthStore((s) => s.textSize);
  const set = useHealthStore((s) => s.setTextSize);
  const opts = [
    ['md', 'A', 'Normal text'],
    ['lg', 'A+', 'Large text'],
    ['xl', 'A++', 'Extra large text'],
  ];
  return (
    <div role="group" aria-label="Text size" className="flex overflow-hidden rounded-input border border-line">
      {opts.map(([v, l, label]) => (
        <button
          key={v}
          type="button"
          aria-pressed={size === v}
          onClick={() => set(v)}
          className={`min-h-touch min-w-touch px-2 text-sm font-bold ${size === v ? 'bg-accent text-white' : 'bg-surface text-ink hover:bg-surface-2'}`}
          data-testid={`text-size-${v}`}
        >
          <span aria-hidden="true">{l}</span>
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

function ProfileMenu() {
  const user = useHealthStore((s) => s.user);
  const profile = useHealthStore((s) => s.profile);
  const logout = useHealthStore((s) => s.logout);
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    const esc = (e) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const item = 'flex min-h-touch items-center rounded-input px-3 text-sm font-semibold text-ink hover:bg-surface-2';
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="flex min-h-touch items-center gap-2 rounded-full border border-line bg-surface p-1 pr-3 hover:bg-surface-2" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} data-testid="profile-button">
        <Avatar src={user?.avatar} name={user?.name} size={36} />
        <span className="hidden text-sm font-semibold xl:inline">{(user?.name || '').replace(/^Cdr\.\s*/, '')}</span>
        <span className="sr-only">Account menu for {user?.name}</span>
      </button>
      {open && (
        <div className="rise absolute right-0 top-[52px] z-50 w-64 rounded-card border border-line bg-surface p-2 shadow-float">
          <div className="flex items-center gap-3 border-b border-line px-2 pb-3 pt-1">
            <Avatar src={user?.avatar} name={user?.name} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-ink-3">{profile?.role} · {profile?.callsign}</p>
            </div>
          </div>
          <nav aria-label="Account" className="flex flex-col pt-1">
            <Link className={item} to="/settings" onClick={() => setOpen(false)}>Mission &amp; Settings</Link>
            <Link className={item} to="/telemetry" onClick={() => setOpen(false)}>Live Telemetry</Link>
            <Link className={item} to="/guide" onClick={() => setOpen(false)}>Measurement guide</Link>
            <Link className={item} to="/credits" onClick={() => setOpen(false)}>Credits &amp; sources</Link>
            <button
              type="button"
              className={`${item} text-left text-crit-fg`}
              onClick={async () => {
                await logout();
                navigate('/login', { replace: true });
              }}
              data-testid="sign-out"
            >
              Sign out
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

function Header() {
  const day = useHealthStore((s) => s.status.missionDay);
  const delay = useHealthStore((s) => s.delaySeconds);
  const apiOnline = useHealthStore((s) => s.apiOnline);
  const alerts = useHealthStore((s) => s.status.alerts.length);
  return (
    <header className="z-30 border-b border-line bg-surface lg:sticky lg:top-0">
      {/* Row 1: brand, main tabs, then Emergency + profile in the top-right corner.
          Row 2: mission status. DOM order matches the visual order for keyboard users. */}
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 pb-2 pt-2.5 sm:px-6">
        <Link to="/" className="flex min-h-touch items-center">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden flex-wrap gap-1 lg:ml-10 lg:flex xl:ml-16">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) => `relative flex min-h-touch items-center gap-2 rounded-[10px] px-3.5 text-[15px] ${isActive ? 'bg-accent-soft font-semibold text-accent' : 'font-medium text-ink-2 hover:bg-surface-2'}`}
            >
              {n.label}
              {n.to === '/alerts' && alerts > 0 && (
                <span className="rounded-full bg-warn-bg px-1.5 text-[11px] font-bold text-warn-fg">
                  {alerts}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          <NavLink to="/emergency" className="btn-danger min-h-touch px-3 text-sm" data-testid="emergency-button">
            Emergency
          </NavLink>
          <ProfileMenu />
        </div>
        <div className="flex basis-full flex-wrap items-center gap-2.5 lg:justify-end">
          <span className="pill font-mono" data-testid="header-day">MET · Day {day ?? '—'}</span>
          <span className="pill" data-testid="earth-link">
            <span className={`block h-2 w-2 rounded-full ${apiOnline === false ? 'bg-warn-dot' : 'blink bg-ok-dot'}`} aria-hidden="true" />
            Earth link {delay > 0 ? `≈${formatDelay(delay)} one-way` : 'real-time'}
            {apiOnline === false && <span className="text-warn-fg"> · offline</span>}
          </span>
          <span className="sr-only" role="status" data-testid="connection-status" data-online={apiOnline !== false}>
            {apiOnline === false ? 'Ground link offline: local mode' : 'Ground link online'}
          </span>
          <div className="hidden sm:block">
            <TextSizeToggle />
          </div>
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav aria-label="Main (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pb-3 lg:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-accent' : 'text-ink-3'}`}>
              {({ isActive }) => (
                <>
                  <span className={`flex h-7 w-11 items-center justify-center rounded-full ${isActive ? 'bg-accent-soft' : ''}`}>
                    <NavIcon d={n.icon} />
                  </span>
                  {n.short}
                </>
              )}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}

const TITLES = {
  '/': 'Console',
  '/log': 'Log Readings',
  '/history': 'History',
  '/telemetry': 'Live Telemetry',
  '/alerts': 'Guidance',
  '/guide': 'Measurement Guide',
  '/emergency': 'Emergency',
  '/data': 'NASA Data',
  '/settings': 'Mission and Settings',
  '/credits': 'Credits',
};

export function Disclaimer({ className = '' }) {
  return (
    <footer className={`border-t border-line bg-surface px-4 py-3 text-center text-xs text-ink-3 ${className}`}>
      <span data-testid="disclaimer">
        <span className="sm:hidden">Demo decision support: not a medical device, not medical advice.</span>
        <span className="hidden sm:inline">Decision support for demonstration, not a medical device and not medical advice. {DISCLAIMER}</span>
      </span>{' '}
      <Link to="/credits" className="font-semibold text-accent underline">Credits</Link>
    </footer>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${TITLES[pathname] ?? 'Evexia'} · Evexia Crew Health Console`;
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[60] rounded-input bg-accent px-4 py-2 font-bold text-white">
        Skip to main content
      </a>
      <Header />
      <main id="main" tabIndex={-1} className="w-full flex-1 px-4 pb-[180px] pt-6 sm:px-6 lg:pb-[140px]">
        <Outlet />
      </main>
      <Disclaimer className="mb-[72px] lg:mb-0" />
      <TabBar />
      <AIDock />
      <Toast />
    </div>
  );
}
