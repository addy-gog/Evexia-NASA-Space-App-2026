import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { LogoMark, Avatar } from './Brand.jsx';
import { Disclaimer, TextSizeToggle, ThemeToggle } from './Layout.jsx';
import Toast from './Toast.jsx';

const NAV = [
  { to: '/surgeon', label: 'Crew overview', icon: 'M3 12l9-8 9 8v8a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z', end: true },
  { to: '/surgeon/escalations', label: 'Escalations', icon: 'M12 3l10 18H2zM12 10v4M12 17.5v.5' },
  { to: '/surgeon/data', label: 'NASA data', icon: 'M12 3a9 9 0 1 0 9 9M12 3v9l6 3' },
  { to: '/surgeon/credits', label: 'Credits', icon: 'M4 5a2 2 0 0 1 2-2h13v18H6a2 2 0 0 1-2-2zM8 7h7M8 11h7' },
];

/** Flight-surgeon shell: left sidebar (navigation + signed-in surgeon), content on the right. */
export default function SurgeonLayout() {
  const user = useHealthStore((s) => s.user);
  const logout = useHealthStore((s) => s.logout);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  useEffect(() => {
    document.title = `${pathname.includes('/crew/') ? 'Crew member' : pathname.endsWith('escalations') ? 'Escalations' : 'Crew overview'} · Evexia Flight Surgeon`;
  }, [pathname]);

  return (
    <div className="flex min-h-screen flex-col lg:flex-row">
      <a href="#main" className="sr-only-focusable fixed left-2 top-2 z-[60] rounded-input bg-accent px-4 py-2 font-bold text-white">
        Skip to main content
      </a>
      <aside className="flex flex-col gap-4 border-b border-ink/[0.06] bg-[rgb(var(--chrome)/0.90)] p-4 lg:sticky lg:top-0 lg:h-screen lg:w-[264px] lg:flex-none lg:border-b-0 lg:border-r lg:border-ink/[0.06]">
        <div className="flex items-center gap-2.5">
          <LogoMark size={36} />
          <span className="flex flex-col leading-tight">
            <span className="font-display text-xl font-bold tracking-tight">Evexia</span>
            <span className="text-[11px] font-medium text-ink-3">Flight surgeon</span>
          </span>
        </div>
        <nav aria-label="Flight surgeon" className="flex flex-wrap gap-1 lg:flex-col">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) => `flex min-h-touch items-center gap-3 rounded-full px-4 text-[15px] transition-colors duration-200 ${isActive ? "bg-accent font-semibold text-white shadow-glow" : "font-medium text-ink-2 hover:bg-ink/[0.06] hover:text-ink"}`}
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d={n.icon} />
              </svg>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="mt-auto hidden flex-col gap-2 lg:flex">
          <ThemeToggle />
          <TextSizeToggle />
        </div>
        <div className="flex items-center gap-3 rounded-card border border-ink/10 bg-ink/[0.03] p-2.5 lg:mt-2">
          <Avatar src={user?.avatar} name={user?.name} size={40} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{user?.name}</p>
            <p className="truncate text-xs text-ink-3">Flight Surgeon · @{user?.username}</p>
          </div>
          <button
            type="button"
            className="btn-ghost h-11 w-11 p-0"
            aria-label="Sign out"
            data-testid="sign-out"
            onClick={async () => {
              await logout();
              navigate('/login', { replace: true });
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" /></svg>
          </button>
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <main id="main" tabIndex={-1} className="w-full flex-1 px-4 pb-16 pt-6 sm:px-8">
          <Outlet />
        </main>
        <Disclaimer />
      </div>
      <Toast />
    </div>
  );
}
