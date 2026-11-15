// Starts the single-host test server (API + built client) and returns a teardown that
// kills it directly. Used instead of Playwright's `webServer`, whose shutdown waits on
// open browser sockets for ~5 minutes on Windows.
import { spawn } from 'node:child_process';

export const PORT = 8799;
const HEALTH = `http://localhost:${PORT}/api/health`;

async function healthy() {
  try {
    return (await fetch(HEALTH)).ok;
  } catch {
    return false;
  }
}

export default async function globalSetup() {
  if (await healthy()) return undefined; // reuse a server you started yourself

  const child = spawn(process.execPath, ['e2e/start-api.js'], {
    env: { ...process.env, PORT: String(PORT), ANTHROPIC_API_KEY: '', DATABASE_PATH: 'server/data/e2e.db', SERVE_CLIENT: 'true', LOGIN_RATE_LIMIT: '1000' },
    stdio: ['ignore', 'inherit', 'inherit'],
  });
  const deadline = Date.now() + 60_000;
  while (!(await healthy())) {
    if (child.exitCode !== null) throw new Error(`Test server exited with code ${child.exitCode}`);
    if (Date.now() > deadline) {
      child.kill();
      throw new Error('Test server did not become healthy within 60 s');
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return async () => {
    child.kill();
  };
}
