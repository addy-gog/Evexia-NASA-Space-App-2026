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
  // Body replaced NASA in the bar (Mutalib, 15 Nov 2026); NASA Data is in the profile menu.
  { to: '/body', label: 'Body', short: 'Body', icon: 'M12 2.5a2.5 2.5 0 1 0 0 5a2.5 2.5 0 1 0 0-5zM6 9.5h12M12 9.5v6M12 15.5l-3.5 6M12 15.5l3.5 6' },
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
          className={`min-h-touch min-w-touch px-2 text-sm font-bold ${size === v ? "bg-accent text-white" : "bg-ink/[0.03] text-ink hover:bg-ink/[0.08]"}`}
          data-testid={`text-size-${v}`}
        >
          <span aria-hidden="true">{l}</span>
          <span className="sr-only">{label}</span>
        </button>
      ))}
    </div>
  );
}

/** Dark (default, deep space) or light theme. Saved with the other display settings. */
export function ThemeToggle({ className = '' }) {
  const theme = useHealthStore((s) => s.theme);
  const set = useHealthStore((s) => s.setTheme);
  const opts = [
    ['dark', 'Dark', 'M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z'],
    ['light', 'Light', 'M12 3v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M3 12h2M19 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z'],
  ];
  return (
    <div role="group" aria-label="Theme" className={`flex overflow-hidden rounded-input border border-line ${className}`}>
      {opts.map(([v, l, d]) => (
        <button
          key={v}
          type="button"
          aria-pressed={theme === v}
          onClick={() => set(v)}
          className={`flex min-h-touch flex-1 items-center justify-center gap-2 px-3 text-sm font-semibold transition-colors duration-200 ${theme === v ? 'bg-accent text-white' : 'bg-ink/[0.03] text-ink hover:bg-ink/[0.08]'}`}
          data-testid={`theme-${v}`}
        >
          <NavIcon d={d} />
          {l}
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
      <button type="button" className="flex min-h-touch items-center gap-2 rounded-full border border-ink/10 bg-ink/[0.04] p-1 pr-3 hover:bg-ink/[0.08]" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} data-testid="profile-button">
        <Avatar src={user?.avatar} name={user?.name} size={36} />
        <span className="hidden text-sm font-semibold 2xl:inline">{(user?.name || '').replace(/^Cdr\.\s*/, '')}</span>
        <span className="sr-only">Account menu for {user?.name}</span>
      </button>
      {open && (
        <div className="rise absolute right-0 top-[52px] z-50 w-72 rounded-card border border-ink/10 bg-surface/95 p-2 shadow-float">
          <div className="flex items-center gap-3 border-b border-line px-2 pb-3 pt-1">
            <Avatar src={user?.avatar} name={user?.name} size={44} />
            <div className="min-w-0">
              <p className="truncate font-semibold">{user?.name}</p>
              <p className="truncate text-xs text-ink-3">{profile?.role} · {profile?.callsign}</p>
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 border-b border-line px-2 py-3 xl:hidden">
            <span className="text-sm font-semibold text-ink-2">Text size</span>
            <TextSizeToggle />
          </div>
          <nav aria-label="Account" className="flex flex-col pt-1">
            <Link className={item} to="/settings" onClick={() => setOpen(false)}>Mission &amp; Settings</Link>
            <Link className={item} to="/comms" onClick={() => setOpen(false)}>Earth link</Link>
            <Link className={item} to="/data" onClick={() => setOpen(false)}>NASA Data</Link>
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
  const link = useHealthStore((s) => s.earthLink);
  const blackout = link?.mode === 'blackout';
  const waiting = link?.waiting ?? 0;
  return (
    <header className="z-30 border-b border-ink/[0.06] bg-[rgb(var(--chrome)/0.90)] lg:sticky lg:top-0">
      <div className="mx-auto flex max-w-page flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link to="/" className="flex min-h-touch items-center">
          <Wordmark />
        </Link>
        <nav aria-label="Main" className="hidden items-center gap-1 rounded-full border border-ink/[0.07] bg-ink/[0.03] p-1 lg:flex">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === '/'}
              className={({ isActive }) =>
                `relative flex min-h-touch items-center gap-2 rounded-full px-3 text-[14px] transition-colors duration-200 ${isActive ? 'bg-accent font-semibold text-white shadow-glow' : 'font-medium text-ink-2 hover:bg-ink/[0.06] hover:text-ink'}`
              }
            >
              <NavIcon d={n.icon} />
              {n.label}
              {n.to === '/alerts' && alerts > 0 && (
                <span className="rounded-full bg-warn-bg px-1.5 text-[11px] font-bold text-warn-fg ring-1 ring-warn-line">
                  {alerts}
                  <span className="sr-only"> active</span>
                </span>
              )}
            </NavLink>
          ))}
        </nav>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {/* Two different links: this screen to the onboard server, and the spacecraft to Earth. */}
          <span className={`pill ${apiOnline === false ? 'flex' : 'hidden 2xl:flex'}`} data-testid="onboard-status">
            <span className={`block h-2 w-2 rounded-full ${apiOnline === false ? 'bg-warn-dot' : 'bg-ok-dot'}`} aria-hidden="true" />
            {apiOnline === false ? <span className="text-warn-fg">Onboard server unreachable</span> : 'Onboard OK'}
          </span>
          <Link to="/comms" className="pill hover:bg-ink/[0.06]" data-testid="earth-link" data-mode={link?.mode ?? 'unknown'}>
            <span className="font-mono text-ink-3" data-testid="header-day">Day {day ?? '—'}</span>
            <span className="h-3.5 w-px bg-ink/15" aria-hidden="true" />
            <span className={`block h-2 w-2 rounded-full ${blackout ? 'bg-warn-dot' : 'blink bg-ok-dot'}`} aria-hidden="true" />
            Earth {delay > 0 ? `≈${formatDelay(delay)} one-way` : 'real-time'}
            {blackout && <span className="text-warn-fg"> · link down</span>}
            {waiting > 0 && <span className="font-semibold text-warn-fg" data-testid="earth-waiting"> · {waiting} waiting</span>}
          </Link>
          <span className="sr-only" role="status" data-testid="connection-status" data-online={apiOnline !== false}>
            {apiOnline === false ? 'Onboard server unreachable: working from this device' : 'Onboard server reachable'}
          </span>
          <NavLink to="/emergency" className="btn-danger min-h-touch rounded-full px-4 text-sm" data-testid="emergency-button">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 7v6M12 17h.01M8 2h8l6 6v8l-6 6H8l-6-6V8z" /></svg>
            Emergency
          </NavLink>
          <div className="hidden xl:block">
            <TextSizeToggle />
          </div>
          <ProfileMenu />
        </div>
      </div>
    </header>
  );
}

function TabBar() {
  return (
    <nav aria-label="Main (mobile)" className="fixed inset-x-0 bottom-0 z-30 border-t border-ink/[0.06] bg-[rgb(var(--chrome)/0.95)] pb-3 lg:hidden">
      <ul className="grid grid-cols-5">
        {NAV.map((n) => (
          <li key={n.to}>
            <NavLink to={n.to} end={n.to === '/'} className={({ isActive }) => `flex min-h-[56px] flex-col items-center justify-center gap-1 text-[11px] font-semibold ${isActive ? 'text-accent-text' : 'text-ink-3'}`}>
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
  '/body': 'Body',
  '/history': 'History',
  '/telemetry': 'Live Telemetry',
  '/alerts': 'Guidance',
  '/guide': 'Measurement Guide',
  '/emergency': 'Emergency',
  '/comms': 'Earth link',
  '/data': 'NASA Data',
  '/settings': 'Mission and Settings',
  '/credits': 'Credits',
};

export function Disclaimer({ className = '' }) {
  return (
    <footer className={`border-t border-ink/[0.06] bg-[rgb(var(--chrome)/0.85)] px-4 py-3 text-center text-xs text-ink-3 ${className}`}>
      <span data-testid="disclaimer">
        <span className="sm:hidden">Demo decision support: not a medical device, not medical advice.</span>
        <span className="hidden sm:inline">Decision support for demonstration, not a medical device and not medical advice. {DISCLAIMER}</span>
      </span>{' '}
      <Link to="/credits" className="font-semibold text-accent-text underline">Credits</Link>
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
