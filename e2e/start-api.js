// Starts the API for end-to-end tests with a fresh, freshly seeded database.
import fs from 'node:fs';
import path from 'node:path';

const db = path.resolve(process.env.DATABASE_PATH || 'server/data/e2e.db');
process.env.DATABASE_PATH = db;
for (const suffix of ['', '-wal', '-shm']) fs.rmSync(db + suffix, { force: true });
await import('../server/index.js');

