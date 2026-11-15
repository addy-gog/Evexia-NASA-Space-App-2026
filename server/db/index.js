/**
 * SQLite access. Prefers `better-sqlite3`; falls back to Node's built-in
 * `node:sqlite` (Node >= 22.5) when the native module is not installed or
 * failed to build. Both expose the same synchronous prepare/run/get/all API.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);

export const DEFAULT_DB_PATH = process.env.DATABASE_PATH || path.join(here, '..', 'data', 'evexia.db');

function openDriver(file) {
  try {
    // EVEXIA_SQLITE_DRIVER=node forces the built-in driver (used to test the fallback).
    if (process.env.EVEXIA_SQLITE_DRIVER === 'node') throw new Error('forced node:sqlite');
    const Better = require('better-sqlite3');
    const db = new Better(file);
    db.pragma('journal_mode = WAL');
    return { db, driver: 'better-sqlite3' };
  } catch {
    const { DatabaseSync } = require('node:sqlite');
    const db = new DatabaseSync(file);
    if (file !== ':memory:') db.exec('PRAGMA journal_mode = WAL;');
    return { db, driver: 'node:sqlite' };
  }
}

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS crew (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  born TEXT, sex TEXT, blood_type TEXT, height_cm REAL, mass_kg REAL, callsign TEXT, avatar TEXT
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('astronaut', 'surgeon')),
  crew_id TEXT REFERENCES crew(id),
  name TEXT NOT NULL,
  avatar TEXT
);
CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS readings (
  id TEXT PRIMARY KEY,
  crew_id TEXT NOT NULL REFERENCES crew(id),
  ts TEXT NOT NULL,
  hr REAL, sys REAL, dia REAL, glucose REAL, temp REAL, sleep REAL,
  radiation REAL, -- absorbed dose, mGy/day
  spe INTEGER NOT NULL DEFAULT 0,
  environment TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  device TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_readings_crew_ts ON readings(crew_id, ts);
CREATE TABLE IF NOT EXISTS baselines (
  crew_id TEXT PRIMARY KEY REFERENCES crew(id),
  hr REAL, sys REAL, dia REAL, glucose REAL, temp REAL, sleep REAL
);
CREATE TABLE IF NOT EXISTS escalations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL,
  priority TEXT NOT NULL DEFAULT 'routine',
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'new',
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  crew_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  metric TEXT NOT NULL,
  value REAL NOT NULL,
  ts TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telemetry_crew_ts ON telemetry(crew_id, ts);
CREATE TABLE IF NOT EXISTS devices (
  crew_id TEXT NOT NULL,
  device_id TEXT NOT NULL,
  device_name TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'gateway',
  last_seen TEXT NOT NULL,
  PRIMARY KEY (crew_id, device_id)
);
`;

export function openDb(file = DEFAULT_DB_PATH) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const { db, driver } = openDriver(file);
  db.exec(SCHEMA);
  return { db, driver };
}

/** Normalise rows (node:sqlite returns null-prototype objects). */
export const plain = (row) => (row ? { ...row } : row);
