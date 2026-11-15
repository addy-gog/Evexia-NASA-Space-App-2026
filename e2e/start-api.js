// Starts the API for end-to-end tests with a fresh, freshly seeded database.
import fs from 'node:fs';
import path from 'node:path';

const db = path.resolve(process.env.DATABASE_PATH || 'server/data/e2e.db');
process.env.DATABASE_PATH = db;
// Reports reach the flight surgeon instantly unless a test slows the Earth link down itself.
process.env.LINK_TIME_SCALE ??= '0';
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(db + suffix, { force: true });
await import('../server/index.js');

