import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { LogoMark, Avatar } from '../components/Brand.jsx';
import CompanionStill from '../components/ai/CompanionStill.jsx';

/** Demo accounts grouped by category for quick onboarding (also listed in README). */
const DEMO_GROUPS = [
  {
    category: 'Female Astronauts',
    tag: 'Flight Crew',
    members: [
      { username: 'okafor', password: 'Okafor-2026', name: 'Cdr. Ada Okafor', role: 'Commander', avatar: '/avatars/c1.svg' },
      { username: 'tanaka', password: 'Tanaka-2026', name: 'Mei Tanaka', role: 'Flight Engineer', avatar: '/avatars/c3.svg' },
      { username: 'nair', password: 'Nair-2026', name: 'Priya Nair', role: 'Science Officer / Medical', avatar: '/avatars/c5.svg' },
    ],
  },
  {
    category: 'Male Astronauts',
    tag: 'Flight Crew',
    members: [
      { username: 'marchetti', password: 'Marchetti-2026', name: 'Leo Marchetti', role: 'Pilot', avatar: '/avatars/c2.svg' },
      { username: 'rivera', password: 'Rivera-2026', name: 'Sam Rivera', role: 'Mission Specialist', avatar: '/avatars/c4.svg' },
    ],
  },
  {
    category: 'Ground Station & Medical Control',
    tag: 'Surgeon',
    members: [
      { username: 'surgeon', password: 'Surgeon-2026', name: 'Dr. Jonas Lindqvist', role: 'Flight Surgeon', avatar: '/avatars/s1.svg' },
    ],
  },
];

export default function Login() {
  const user = useHealthStore((s) => s.user);
  const login = useHealthStore((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to={user.role === 'surgeon' ? '/surgeon' : '/'} replace />;

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!username.trim() || !password) {
      setError('Enter your username and password.');
      return;
    }
    setBusy(true);
    try {
      const u = await login(username.trim(), password);
      navigate(u.role === 'surgeon' ? '/surgeon' : '/', { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Wrong username or password.' : err.status === 429 ? 'Too many attempts. Wait a minute and try again.' : 'Cannot reach the ground station. Check the connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen">
      <main id="main" className="mx-auto grid min-h-screen max-w-page items-center gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[1.1fr_1fr]">
        <section className="flex flex-col gap-6" aria-labelledby="login-hero">
          <div className="flex items-center gap-3">
            <LogoMark size={48} />
            <span className="font-display text-2xl font-bold tracking-tight">Evexia</span>
          </div>
          <div>
            <p className="eyebrow">Crew health console</p>
            <h1 id="login-hero" className="page-title mt-2 max-w-[560px]">Know your health, wherever the mission takes you.</h1>
            <p className="mt-3 max-w-[540px] text-ink-3">
              Log readings, stream your wearables and get the next step for every reading. Your flight surgeon sees the whole crew, even with a 20-minute Earth link.
            </p>
          </div>
          <div className="hidden items-center gap-5 rounded-card border border-line bg-surface p-5 lg:flex">
            <span className="relative block h-[96px] w-[96px] flex-none rounded-full bg-accent-soft" aria-hidden="true">
              <span className="orbit absolute inset-[6px] block rounded-full border-[1.5px] border-dashed border-accent-text/70">
                <span className="absolute -top-1 left-1/2 block h-2 w-2 rounded-full bg-accent" />
              </span>
              <span className="absolute -top-2 left-1/2 block -translate-x-1/2"><CompanionStill size={96} /></span>
            </span>
            <p className="text-sm text-ink-2">
              <strong className="text-ink">Decision support, not a medical device.</strong> Demonstration thresholds; radiation, sleep, hypothermia and the glucose lower limit follow published NASA figures.
            </p>
          </div>
        </section>

        <section className="hud-panel mx-auto w-full max-w-[460px] p-6 sm:p-8" aria-labelledby="login-title">
          <h2 id="login-title" className="font-display text-2xl font-bold">Sign in</h2>
          <p className="mt-1 text-sm text-ink-3">Astronauts see their own health record. The flight surgeon sees the whole crew.</p>
          <form onSubmit={submit} noValidate className="mt-5 flex flex-col gap-4" aria-label="Sign in">
            <label className="block">
              <span className="label">Username</span>
              <input className="field mt-1 font-sans text-base" autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} data-testid="login-username" />
            </label>
            <div>
              <label htmlFor="login-password" className="label block">Password</label>
              <div className="relative mt-1">
                <input
                  id="login-password"
                  className="field pr-12 font-sans text-base"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  data-testid="login-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full text-ink-3 transition-colors hover:bg-ink/[0.08] hover:text-ink focus:outline-none focus:ring-2 focus:ring-accent"
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  data-testid="toggle-password-visibility"
                >
                  {showPassword ? (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>
            {error && (
              <p className="rounded-tile bg-crit-bg px-3 py-2 text-sm font-semibold text-crit-fg" role="alert" data-testid="login-error">
                {error}
              </p>
            )}
            <button type="submit" className="btn-primary w-full" disabled={busy} data-testid="login-submit">
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
          </form>

          <details className="mt-6 rounded-tile border border-line" open>
            <summary className="flex min-h-touch cursor-pointer items-center justify-between px-3 text-sm font-semibold">
              <span>Demo accounts (fictional crew)</span>
              <span className="text-xs text-ink-3">6 accounts</span>
            </summary>
            <div className="divide-y divide-line border-t border-line">
              {DEMO_GROUPS.map((group) => (
                <div key={group.category} className="py-2">
                  <div className="flex items-center justify-between px-3 pb-1 pt-0.5">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-accent-text">
                      {group.category}
                    </span>
                    <span className="rounded bg-ink/[0.06] px-1.5 py-0.5 text-[10px] font-semibold text-ink-3">
                      {group.tag}
                    </span>
                  </div>
                  <ul className="divide-y divide-line/60">
                    {group.members.map((d) => (
                      <li key={d.username} className="flex items-center gap-3 px-3 py-2">
                        <Avatar src={d.avatar} name={d.name} size={36} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-ink">{d.name}</p>
                          <p className="truncate font-mono text-xs text-ink-3">{d.role} · <span className="text-ink-2">{d.username}</span></p>
                        </div>
                        <button
                          type="button"
                          className="btn-ghost min-h-touch px-3 text-xs font-semibold"
                          onClick={() => {
                            setUsername(d.username);
                            setPassword(d.password);
                          }}
                          aria-label={`Use the ${d.name} demo account`}
                          data-testid={`demo-${d.username}`}
                        >
                          Use
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </details>
        </section>
      </main>
    </div>
  );
}
