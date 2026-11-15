import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { openDb, DEFAULT_DB_PATH } from './db/index.js';
import { createRepo } from './db/repo.js';
import { createApp } from './app.js';
import { seed } from './seed.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 8787;
const TELEMETRY_RETENTION_DAYS = Number(process.env.TELEMETRY_RETENTION_DAYS) || 7;

// Auto-seed on first start (e.g. a fresh Render disk) so the API is never empty.
let opened;
if (!fs.existsSync(DEFAULT_DB_PATH)) {
  console.log('No database found: seeding crew and sample log history...');
  opened = seed();
} else {
  opened = openDb();
}
const { db, driver } = opened;
const repo = createRepo(db);
if (!repo.listCrew().length) console.warn('Database has no crew. Run `npm run seed`.');

// Raw telemetry is kept for a limited time; synced log entries are permanent.
const prune = () => {
  repo.pruneTelemetry(new Date(Date.now() - TELEMETRY_RETENTION_DAYS * 86_400_000).toISOString());
  repo.pruneSessions();
};
prune();
setInterval(prune, 3_600_000).unref();

const app = createApp({ repo, driver });

// Optional single-host deploy: serve the built client if it exists.
const dist = path.join(here, '..', 'client', 'dist');
if (process.env.SERVE_CLIENT !== 'false' && fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => {
  console.log(
    `Evexia API listening on http://localhost:${PORT} (db: ${driver}, assistant: ${process.env.ANTHROPIC_API_KEY ? 'claude' : 'offline'}, telemetry: ${process.env.TELEMETRY_KEY ? 'key required' : 'open'})`,
  );
});
