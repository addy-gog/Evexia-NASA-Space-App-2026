import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useHealthStore } from '../store/useHealthStore.js';
import { LogoMark, Avatar } from '../components/Brand.jsx';
import CompanionStill from '../components/ai/CompanionStill.jsx';

/** Demo accounts (also printed by `npm run seed` and listed in the README). */
const DEMO = [
  { username: 'okafor', password: 'Okafor-2026', name: 'Cdr. Ada Okafor', role: 'Commander', avatar: '/avatars/c1.svg' },
  { username: 'marchetti', password: 'Marchetti-2026', name: 'Leo Marchetti', role: 'Pilot', avatar: '/avatars/c2.svg' },
  { username: 'tanaka', password: 'Tanaka-2026', name: 'Mei Tanaka', role: 'Flight Engineer', avatar: '/avatars/c3.svg' },
  { username: 'rivera', password: 'Rivera-2026', name: 'Sam Rivera', role: 'Mission Specialist', avatar: '/avatars/c4.svg' },
  { username: 'nair', password: 'Nair-2026', name: 'Priya Nair', role: 'Science Officer', avatar: '/avatars/c5.svg' },
  { username: 'surgeon', password: 'Surgeon-2026', name: 'Dr. Jonas Lindqvist', role: 'Flight Surgeon', avatar: '/avatars/s1.svg' },
];

export default function Login() {
  const user = useHealthStore((s) => s.user);
  const login = useHealthStore((s) => s.login);
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
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
    <div className="min-h-screen bg-bg">
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
              <span className="orbit absolute inset-[6px] block rounded-full border-[1.5px] border-dashed border-[#9DB3F0]">
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
            <label className="block">
              <span className="label">Password</span>
              <input className="field mt-1 font-sans text-base" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="login-password" />
            </label>
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
            <summary className="flex min-h-touch cursor-pointer items-center px-3 text-sm font-semibold">Demo accounts (fictional crew)</summary>
            <ul className="divide-y divide-line border-t border-line">
              {DEMO.map((d) => (
                <li key={d.username} className="flex items-center gap-3 px-3 py-2">
                  <Avatar src={d.avatar} name={d.name} size={36} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">{d.name}</p>
                    <p className="truncate font-mono text-xs text-ink-3">{d.username} · {d.password}</p>
                  </div>
                  <button
                    type="button"
                    className="btn-ghost min-h-touch px-3 text-xs"
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
          </details>
        </section>
      </main>
    </div>
  );
}
