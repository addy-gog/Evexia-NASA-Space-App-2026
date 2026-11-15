/**
 * `npm run seed`: (re)builds the SQLite database with crew, default
 * pre-flight baselines and a timestamped sample log history (last 21 days,
 * every entry tagged source "sample").
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb, DEFAULT_DB_PATH } from './db/index.js';
import { createRepo } from './db/repo.js';
import { generateSampleLogs } from './lib/sampleLogs.js';
import { CREW, SURGEON, demoAccounts } from './lib/people.js';
import { hashPassword } from './lib/auth.js';
import { DEFAULT_BASELINE } from '../client/src/config/thresholds.js';

export function seed({ dbPath = DEFAULT_DB_PATH, days = Number(process.env.SEED_DAYS) || 21, now = Date.now() } = {}) {
  if (dbPath !== ':memory:' && fs.existsSync(dbPath)) {
    for (const suffix of ['', '-wal', '-shm']) fs.rmSync(dbPath + suffix, { force: true });
  }
  const { db, driver } = openDb(dbPath);
  const repo = createRepo(db);
  const logs = days > 0 ? generateSampleLogs({ days, now }) : [];
  repo.transaction(() => {
    for (const c of CREW) {
      repo.upsertCrew(c);
      const offset = { c1: 0, c2: 4, c3: -3, c4: -2 }[c.id] ?? 0;
      repo.putBaseline(c.id, { ...DEFAULT_BASELINE, hr: DEFAULT_BASELINE.hr + offset });
    }
    for (const l of logs) repo.upsertReading(l);
    for (const a of demoAccounts()) {
      repo.upsertUser({ id: a.crewId ? `u-${a.crewId}` : `u-${SURGEON.id}`, username: a.username, passwordHash: hashPassword(a.password), role: a.role, crewId: a.crewId, name: a.name, avatar: a.avatar });
    }
  });
  return { db, repo, driver, count: logs.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { count, driver, db } = seed();
  console.log(`Seeded ${CREW.length} crew, ${demoAccounts().length} user accounts and ${count} sample log entries into ${DEFAULT_DB_PATH} (driver: ${driver}).`);
  console.log('Demo logins (change before real use):');
  for (const a of demoAccounts()) console.log(`  ${a.role.padEnd(9)} ${a.username.padEnd(10)} ${a.password}`);
  db.close();
}
