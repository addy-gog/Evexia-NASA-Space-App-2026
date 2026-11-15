/** Data-access functions. All SQL lives here. */
import { plain } from './index.js';

const FIELDS = ['spo2', 'hr', 'sys', 'dia', 'glucose', 'temp', 'sleep', 'radiation'];

export function createRepo(db) {
  const q = {
    crewAll: db.prepare('SELECT * FROM crew ORDER BY id'),
    crewOne: db.prepare('SELECT * FROM crew WHERE id = ?'),
    crewUpsert: db.prepare(
      `INSERT INTO crew (id, name, role, born, sex, blood_type, height_cm, mass_kg, callsign, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, role = excluded.role, born = excluded.born, sex = excluded.sex, blood_type = excluded.blood_type,
         height_cm = excluded.height_cm, mass_kg = excluded.mass_kg, callsign = excluded.callsign, avatar = excluded.avatar`,
    ),
    userUpsert: db.prepare(
      `INSERT INTO users (id, username, password_hash, role, crew_id, name, avatar) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET username = excluded.username, password_hash = excluded.password_hash, role = excluded.role,
         crew_id = excluded.crew_id, name = excluded.name, avatar = excluded.avatar`,
    ),
    userByUsername: db.prepare('SELECT * FROM users WHERE username = ?'),
    sessionInsert: db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)'),
    sessionUser: db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?'),
    sessionDelete: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    sessionPrune: db.prepare('DELETE FROM sessions WHERE expires_at <= ?'),
    readingUpsert: db.prepare(
      // Value columns must stay in the same order as FIELDS.
      `INSERT INTO readings (id, crew_id, ts, spo2, hr, sys, dia, glucose, temp, sleep, radiation, spe, environment, source, device, notes, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET ts = excluded.ts, spo2 = excluded.spo2, hr = excluded.hr, sys = excluded.sys, dia = excluded.dia,
         glucose = excluded.glucose, temp = excluded.temp, sleep = excluded.sleep, radiation = excluded.radiation,
         spe = excluded.spe, environment = excluded.environment, source = excluded.source, device = excluded.device, notes = excluded.notes`,
    ),
    readingOne: db.prepare('SELECT * FROM readings WHERE id = ?'),
    readingDelete: db.prepare('DELETE FROM readings WHERE id = ? AND crew_id = ?'),
    readingsRange: db.prepare('SELECT * FROM readings WHERE crew_id = ? AND ts >= ? AND ts <= ? ORDER BY ts DESC LIMIT ?'),
    readingsCrewSince: db.prepare('SELECT * FROM readings WHERE crew_id = ? AND ts >= ? ORDER BY ts'),
    baselineGet: db.prepare('SELECT * FROM baselines WHERE crew_id = ?'),
    baselineUpsert: db.prepare(
      `INSERT INTO baselines (crew_id, hr, sys, dia, glucose, temp, sleep) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(crew_id) DO UPDATE SET hr = excluded.hr, sys = excluded.sys, dia = excluded.dia,
         glucose = excluded.glucose, temp = excluded.temp, sleep = excluded.sleep`,
    ),
    escInsert: db.prepare('INSERT INTO escalations (crew_id, priority, payload_json, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?)'),
    escAll: db.prepare('SELECT * FROM escalations ORDER BY CASE priority WHEN \'emergency\' THEN 0 ELSE 1 END, id DESC'),
    escOne: db.prepare('SELECT * FROM escalations WHERE id = ?'),
    escUpdate: db.prepare('UPDATE escalations SET status = ?, note = ? WHERE id = ?'),
    telInsert: db.prepare('INSERT INTO telemetry (crew_id, device_id, device_name, metric, value, ts) VALUES (?, ?, ?, ?, ?, ?)'),
    telSince: db.prepare('SELECT * FROM telemetry WHERE crew_id = ? AND ts >= ? ORDER BY ts LIMIT ?'),
    telSinceMetric: db.prepare('SELECT * FROM telemetry WHERE crew_id = ? AND metric = ? AND ts >= ? ORDER BY ts LIMIT ?'),
    telLatest: db.prepare(
      `SELECT t.* FROM telemetry t JOIN (SELECT metric, MAX(id) AS mid FROM telemetry WHERE crew_id = ? GROUP BY metric) m ON t.id = m.mid ORDER BY t.metric`,
    ),
    telPrune: db.prepare('DELETE FROM telemetry WHERE ts < ?'),
    deviceUpsert: db.prepare(
      `INSERT INTO devices (crew_id, device_id, device_name, kind, last_seen) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(crew_id, device_id) DO UPDATE SET device_name = excluded.device_name, kind = excluded.kind, last_seen = excluded.last_seen`,
    ),
    devices: db.prepare('SELECT * FROM devices WHERE crew_id = ? ORDER BY last_seen DESC'),
    noteInsert: db.prepare(
      `INSERT INTO symptom_notes (id, crew_id, ts, summary, details, recheck_at, status, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET summary = excluded.summary, details = excluded.details, recheck_at = excluded.recheck_at, status = excluded.status`,
    ),
    noteOne: db.prepare('SELECT * FROM symptom_notes WHERE id = ?'),
    notesCrew: db.prepare('SELECT * FROM symptom_notes WHERE crew_id = ? ORDER BY ts DESC LIMIT ?'),
    noteStatus: db.prepare('UPDATE symptom_notes SET status = ? WHERE id = ? AND crew_id = ?'),
    gapInsert: db.prepare('INSERT INTO knowledge_gaps (crew_id, topic, question, created_at) VALUES (?, ?, ?, ?)'),
    gapsAll: db.prepare('SELECT * FROM knowledge_gaps ORDER BY id DESC LIMIT ?'),
    gapsCrew: db.prepare('SELECT * FROM knowledge_gaps WHERE crew_id = ? ORDER BY id DESC LIMIT ?'),
  };
  const toNote = (r) =>
    r && { id: r.id, crewId: r.crew_id, ts: r.ts, summary: r.summary, details: r.details, recheckAt: r.recheck_at, status: r.status, source: r.source };
  const toGap = (r) => r && { id: r.id, crewId: r.crew_id, topic: r.topic, question: r.question, createdAt: r.created_at };

  const toReading = (r) =>
    r && {
      id: r.id,
      crewId: r.crew_id,
      ts: r.ts,
      ...Object.fromEntries(FIELDS.filter((f) => r[f] !== null && r[f] !== undefined).map((f) => [f, r[f]])),
      spe: Boolean(r.spe),
      environment: r.environment,
      source: r.source,
      device: r.device,
      notes: r.notes,
    };
  const toEsc = (r) =>
    r && { id: r.id, crewId: r.crew_id, priority: r.priority, payload: JSON.parse(r.payload_json), status: r.status, note: r.note, createdAt: r.created_at };
  const toCrew = (r) =>
    r && { id: r.id, name: r.name, role: r.role, born: r.born, sex: r.sex, bloodType: r.blood_type, heightCm: r.height_cm, massKg: r.mass_kg, callsign: r.callsign, avatar: r.avatar };
  const toUser = (r) => r && { id: r.id, username: r.username, role: r.role, crewId: r.crew_id, name: r.name, avatar: r.avatar };
  const toSample = (r) => ({ crewId: r.crew_id, deviceId: r.device_id, deviceName: r.device_name, metric: r.metric, value: r.value, ts: r.ts });

  const repo = {
    listCrew: () => q.crewAll.all().map((r) => toCrew(plain(r))),
    getCrew: (id) => toCrew(plain(q.crewOne.get(id))),
    upsertCrew: (c) => q.crewUpsert.run(c.id, c.name, c.role, c.born ?? null, c.sex ?? null, c.bloodType ?? null, c.heightCm ?? null, c.massKg ?? null, c.callsign ?? null, c.avatar ?? null),

    upsertUser: (u) => q.userUpsert.run(u.id, u.username, u.passwordHash, u.role, u.crewId ?? null, u.name, u.avatar ?? null),
    userByUsername: (username) => plain(q.userByUsername.get(String(username).toLowerCase())),
    createSession: (hash, userId, expiresAt) => q.sessionInsert.run(hash, userId, expiresAt),
    userForSession: (hash) => toUser(plain(q.sessionUser.get(hash, new Date().toISOString()))),
    deleteSession: (hash) => q.sessionDelete.run(hash),
    pruneSessions: () => q.sessionPrune.run(new Date().toISOString()).changes,

    upsertReading(r) {
      q.readingUpsert.run(
        r.id, r.crewId, new Date(r.ts).toISOString(),
        ...FIELDS.map((f) => (typeof r[f] === 'number' ? r[f] : null)),
        r.spe ? 1 : 0, r.environment ?? 'station', r.source ?? 'manual', r.device ?? null, r.notes ?? '', new Date().toISOString(),
      );
      return toReading(plain(q.readingOne.get(r.id)));
    },
    getReading: (id) => toReading(plain(q.readingOne.get(id))),
    deleteReading: (id, crewId) => q.readingDelete.run(id, crewId).changes > 0,
    listReadings: (crewId, from, to, limit = 2000) => q.readingsRange.all(crewId, from, to, limit).map((r) => toReading(plain(r))),
    readingsSince: (crewId, since) => q.readingsCrewSince.all(crewId, since).map((r) => toReading(plain(r))),

    getBaseline(crewId) {
      const r = plain(q.baselineGet.get(crewId));
      if (!r) return null;
      return { crewId, ...Object.fromEntries(FIELDS.filter((f) => f !== 'radiation' && f !== 'spo2').map((f) => [f, r[f]])) };
    },
    putBaseline(crewId, b) {
      q.baselineUpsert.run(crewId, ...['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep'].map((f) => b[f] ?? null));
      return repo.getBaseline(crewId);
    },

    insertEscalation(p) {
      const info = q.escInsert.run(p.crew.id, p.priority ?? 'routine', JSON.stringify(p), 'new', '', new Date().toISOString());
      return toEsc(plain(q.escOne.get(info.lastInsertRowid)));
    },
    listEscalations: () => q.escAll.all().map((r) => toEsc(plain(r))),
    getEscalation: (id) => toEsc(plain(q.escOne.get(id))),
    updateEscalation(id, { status, note }) {
      const cur = repo.getEscalation(id);
      if (!cur) return null;
      q.escUpdate.run(status ?? cur.status, note ?? cur.note, id);
      return repo.getEscalation(id);
    },

    insertTelemetry(crewId, deviceId, deviceName, kind, samples) {
      const now = new Date().toISOString();
      const out = [];
      repo.transaction(() => {
        for (const s of samples) {
          const ts = s.ts ? new Date(s.ts).toISOString() : now;
          q.telInsert.run(crewId, deviceId, deviceName, s.metric, s.value, ts);
          out.push({ crewId, deviceId, deviceName, metric: s.metric, value: s.value, ts });
        }
        q.deviceUpsert.run(crewId, deviceId, deviceName, kind, now);
      });
      return out;
    },
    telemetrySince: (crewId, since, metric, limit = 5000) =>
      (metric ? q.telSinceMetric.all(crewId, metric, since, limit) : q.telSince.all(crewId, since, limit)).map((r) => toSample(plain(r))),
    telemetryLatest: (crewId) => q.telLatest.all(crewId).map((r) => toSample(plain(r))),
    pruneTelemetry: (before) => q.telPrune.run(before).changes,
    upsertSymptomNote(n) {
      q.noteInsert.run(n.id, n.crewId, n.ts, n.summary, n.details ?? '', n.recheckAt ?? null, n.status ?? 'open', n.source ?? 'assistant', new Date().toISOString());
      return toNote(plain(q.noteOne.get(n.id)));
    },
    getSymptomNote: (id) => toNote(plain(q.noteOne.get(id))),
    listSymptomNotes: (crewId, limit = 200) => q.notesCrew.all(crewId, limit).map((r) => toNote(plain(r))),
    setSymptomNoteStatus(id, crewId, status) {
      if (!q.noteStatus.run(status, id, crewId).changes) return null;
      return toNote(plain(q.noteOne.get(id)));
    },
    insertKnowledgeGap({ crewId, topic, question }) {
      const info = q.gapInsert.run(crewId ?? null, topic, question, new Date().toISOString());
      return Number(info.lastInsertRowid);
    },
    listKnowledgeGaps: (crewId, limit = 100) => (crewId ? q.gapsCrew.all(crewId, limit) : q.gapsAll.all(limit)).map((r) => toGap(plain(r))),

    listDevices: (crewId) => q.devices.all(crewId).map((r) => ({ deviceId: r.device_id, deviceName: r.device_name, kind: r.kind, lastSeen: r.last_seen })),

    transaction(fn) {
      db.exec('BEGIN');
      try {
        const out = fn();
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
  return repo;
}
