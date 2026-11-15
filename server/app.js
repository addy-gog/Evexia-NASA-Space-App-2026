/** Express app factory (no listen) so tests can use supertest. */
import { EventEmitter } from 'node:events';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { validateReading } from '../client/src/lib/severity.js';
import { evaluateCurrent } from '../client/src/lib/evaluate.js';
import { validateEscalationPayload } from '../client/src/lib/escalation.js';
import { validateTelemetryPayload } from '../client/src/lib/telemetry.js';
import { ENVIRONMENTS, READING_FIELDS } from '../client/src/config/thresholds.js';
import { answerQuestion, getAssistantConfig } from './lib/assistant.js';
import { getSpaceWeather } from './lib/spaceWeather.js';
import { ageOn } from './lib/people.js';
import {
  COOKIE,
  verifyPassword,
  newSession,
  tokenHash,
  parseCookies,
  sessionCookie,
  sessionMiddleware,
  requireAuth,
  requireRole,
  canAccessCrew,
} from './lib/auth.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const NASA_DIR = path.join(here, 'data', 'nasa');
const SOURCES = ['manual', 'wearable', 'sample'];
const MAX_FUTURE_MS = 5 * 60_000;
const DAY = 86_400_000;

function badRequest(res, errors) {
  return res.status(400).json({ error: 'validation_error', details: errors });
}
const forbidden = (res) => res.status(403).json({ error: 'forbidden', message: 'You can only access your own health record.' });

function keyMatches(given, expected) {
  if (!expected || typeof given !== 'string') return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(NASA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

export function createApp({
  repo,
  driver = 'unknown',
  assistantConfig = getAssistantConfig(),
  assistantDeps = {},
  rateLimitMax,
  loginRateLimitMax,
  telemetryKey = process.env.TELEMETRY_KEY || '',
  spaceWeatherDeps = {},
} = {}) {
  const app = express();
  const bus = new EventEmitter();
  bus.setMaxListeners(200);
  app.disable('x-powered-by');
  app.set('trust proxy', 1);
  const origins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
  // Credentials (the session cookie) are only allowed for explicitly listed origins.
  app.use(cors(origins.length ? { origin: origins, credentials: true } : {}));
  app.use(express.json({ limit: '256kb' }));
  app.use(sessionMiddleware(repo));

  const api = express.Router();

  /** Resolve the crew id a request targets (astronauts default to their own) and check access. */
  const crewFor = (req, res, given) => {
    const crewId = given || (req.user?.role === 'astronaut' ? req.user.crewId : '');
    if (!crewId) {
      badRequest(res, { crewId: 'crewId is required.' });
      return null;
    }
    if (!repo.getCrew(crewId)) {
      res.status(404).json({ error: 'not_found', message: 'Unknown crew member.' });
      return null;
    }
    if (!canAccessCrew(req.user, crewId)) {
      forbidden(res);
      return null;
    }
    return crewId;
  };

  const profileOf = (c) => ({ ...c, age: c.born ? ageOn(c.born) : null });

  const statusOf = (crewId) => {
    const logs = repo.readingsSince(crewId, new Date(Date.now() - 30 * DAY).toISOString());
    const env = logs.at(-1)?.environment ?? 'station';
    const s = evaluateCurrent(logs, { environment: env });
    return {
      environment: env,
      lastLogAt: s.latestLog?.ts ?? null,
      score: s.score.score,
      band: s.score.band?.label ?? null,
      severities: Object.fromEntries(Object.entries(s.results).map(([k, v]) => [k, v.severity])),
      reasons: Object.fromEntries(Object.entries(s.results).map(([k, v]) => [k, v.reason])),
      values: Object.fromEntries(Object.entries(s.snapshot).map(([k, v]) => [k, { value: v.value, ts: v.ts, stale: v.stale, source: v.source, device: v.device }])),
      hazards: s.hazards.map((h) => ({ id: h.id, severity: h.severity, title: h.title })),
    };
  };

  api.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'evexia-api',
      db: driver,
      assistant: assistantConfig.apiKey ? 'claude' : 'offline',
      model: assistantConfig.apiKey ? assistantConfig.model : null,
      telemetryAuth: telemetryKey ? 'key-required' : 'open',
      time: new Date().toISOString(),
    });
  });

  // ---------- Authentication ----------
  const loginLimiter = rateLimit({
    windowMs: 60_000,
    limit: loginRateLimitMax ?? (Number(process.env.LOGIN_RATE_LIMIT) || 30),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many sign-in attempts. Wait a minute.' },
  });

  api.post('/auth/login', loginLimiter, (req, res) => {
    const { username, password } = req.body ?? {};
    if (typeof username !== 'string' || typeof password !== 'string' || !username || !password || username.length > 64 || password.length > 200) {
      return badRequest(res, { credentials: 'Enter a username and password.' });
    }
    const row = repo.userByUsername(username.trim().toLowerCase());
    if (!row || !verifyPassword(password, row.password_hash)) return res.status(401).json({ error: 'invalid_credentials', message: 'Wrong username or password.' });
    const s = newSession();
    repo.createSession(s.hash, row.id, s.expiresAt);
    res.set('Set-Cookie', sessionCookie(s.token, req));
    const user = { id: row.id, username: row.username, role: row.role, crewId: row.crew_id, name: row.name, avatar: row.avatar };
    return res.json({ user, crew: user.crewId ? profileOf(repo.getCrew(user.crewId)) : null, expiresAt: s.expiresAt });
  });

  api.post('/auth/logout', (req, res) => {
    const token = parseCookies(req.get('cookie'))[COOKIE];
    if (token) repo.deleteSession(tokenHash(token));
    res.set('Set-Cookie', sessionCookie('', req, 0));
    return res.status(204).end();
  });

  // 200 with user null when signed out, so a first visit does not log a network error.
  api.get('/auth/me', (req, res) => {
    if (!req.user) return res.json({ user: null, crew: null });
    return res.json({ user: req.user, crew: req.user.crewId ? profileOf(repo.getCrew(req.user.crewId)) : null });
  });

  // ---------- Crew (flight surgeon) ----------
  api.get('/crew', requireRole('surgeon'), (_req, res) => {
    res.json({ crew: repo.listCrew().map((c) => ({ ...profileOf(c), ...statusOf(c.id) })) });
  });

  api.get('/crew/:id', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.params.id);
    if (!crewId) return undefined;
    const since = new Date(Date.now() - 30 * DAY).toISOString();
    return res.json({
      profile: profileOf(repo.getCrew(crewId)),
      status: statusOf(crewId),
      baseline: repo.getBaseline(crewId),
      readings: repo.readingsSince(crewId, since).reverse(),
      devices: repo.listDevices(crewId),
      escalations: repo.listEscalations().filter((e) => e.crewId === crewId),
    });
  });

  // ---------- Log entries (timestamped readings) ----------
  api.post('/readings', requireAuth, (req, res) => {
    const b = req.body ?? {};
    const crewId = crewFor(req, res, b.crewId);
    if (!crewId) return undefined;
    const errors = {};
    const ts = new Date(b.ts);
    if (typeof b.ts !== 'string' || Number.isNaN(ts.getTime())) errors.ts = 'ts must be an ISO date-time.';
    else if (ts.getTime() > Date.now() + MAX_FUTURE_MS) errors.ts = 'ts cannot be in the future.';
    if (b.id !== undefined && (typeof b.id !== 'string' || b.id.length > 80)) errors.id = 'id must be a string up to 80 characters.';
    const reading = {};
    for (const f of READING_FIELDS) {
      if (b[f] === undefined || b[f] === null) continue;
      if (typeof b[f] !== 'number') errors[f] = 'Must be a number.';
      else reading[f] = b[f];
    }
    if (!Object.keys(reading).length) errors.reading = 'At least one indicator value is required.';
    Object.assign(errors, validateReading(reading));
    if (b.environment !== undefined && !ENVIRONMENTS[b.environment]) errors.environment = 'Unknown environment.';
    if (b.source !== undefined && !SOURCES.includes(b.source)) errors.source = `source must be one of ${SOURCES.join(', ')}.`;
    if (b.notes !== undefined && (typeof b.notes !== 'string' || b.notes.length > 2000)) errors.notes = 'notes must be text up to 2000 characters.';
    if (b.device !== undefined && b.device !== null && (typeof b.device !== 'string' || b.device.length > 120)) errors.device = 'device must be text up to 120 characters.';
    if (Object.keys(errors).length) return badRequest(res, errors);
    const existing = b.id ? repo.getReading(b.id) : null;
    if (existing && existing.crewId !== crewId) return res.status(409).json({ error: 'id_conflict' });
    const saved = repo.upsertReading({
      ...reading,
      id: b.id || randomUUID(),
      crewId,
      ts: ts.toISOString(),
      spe: Boolean(b.spe),
      environment: b.environment ?? 'station',
      source: b.source ?? 'manual',
      device: b.device ?? null,
      notes: (b.notes ?? '').trim(),
    });
    bus.emit('reading', saved);
    return res.status(existing ? 200 : 201).json(saved);
  });

  api.get('/readings', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.query.crewId ? String(req.query.crewId) : '');
    if (!crewId) return undefined;
    const from = req.query.from ? new Date(String(req.query.from)) : new Date(0);
    const to = req.query.to ? new Date(String(req.query.to)) : new Date(Date.now() + MAX_FUTURE_MS);
    const limit = req.query.limit === undefined ? 2000 : Number(req.query.limit);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from > to) return badRequest(res, { range: 'from/to must be ISO dates with from <= to.' });
    if (!Number.isInteger(limit) || limit < 1 || limit > 5000) return badRequest(res, { limit: 'limit must be 1–5000.' });
    return res.json({ crewId, from: from.toISOString(), to: to.toISOString(), readings: repo.listReadings(crewId, from.toISOString(), to.toISOString(), limit) });
  });

  api.delete('/readings/:id', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.query.crewId ? String(req.query.crewId) : '');
    if (!crewId) return undefined;
    if (!repo.deleteReading(req.params.id, crewId)) return res.status(404).json({ error: 'not_found' });
    return res.status(204).end();
  });

  // ---------- Baseline ----------
  api.get('/baseline/:crewId', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.params.crewId);
    if (!crewId) return undefined;
    const b = repo.getBaseline(crewId);
    if (!b) return res.status(404).json({ error: 'no_baseline' });
    return res.json(b);
  });

  api.put('/baseline/:crewId', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.params.crewId);
    if (!crewId) return undefined;
    const b = req.body ?? {};
    const values = {};
    const errors = {};
    for (const f of ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep']) {
      if (b[f] === undefined || b[f] === null) continue;
      if (typeof b[f] !== 'number' || !Number.isFinite(b[f]) || b[f] <= 0) errors[f] = 'Must be a positive number.';
      else values[f] = b[f];
    }
    Object.assign(errors, validateReading(values));
    if (!Object.keys(values).length) errors.baseline = 'At least one baseline value is required.';
    if (Object.keys(errors).length) return badRequest(res, errors);
    return res.json(repo.putBaseline(crewId, { ...repo.getBaseline(crewId), ...values }));
  });

  // ---------- Escalations ----------
  api.post('/escalations', requireAuth, (req, res) => {
    const errors = validateEscalationPayload(req.body);
    if (errors.length) return badRequest(res, errors);
    const crewId = crewFor(req, res, req.body.crew.id);
    if (!crewId) return undefined;
    const saved = repo.insertEscalation(req.body);
    bus.emit('escalation', saved);
    return res.status(201).json(saved);
  });

  api.get('/escalations', requireAuth, (req, res) => {
    const all = repo.listEscalations();
    res.json({ escalations: req.user.role === 'surgeon' ? all : all.filter((e) => e.crewId === req.user.crewId) });
  });

  api.patch('/escalations/:id', requireRole('surgeon'), (req, res) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return badRequest(res, { id: 'Invalid id.' });
    const { status, note } = req.body ?? {};
    const errors = {};
    if (status !== undefined && !['new', 'reviewed'].includes(status)) errors.status = 'status must be "new" or "reviewed".';
    if (note !== undefined && (typeof note !== 'string' || note.length > 2000)) errors.note = 'note must be a string up to 2000 characters.';
    if (status === undefined && note === undefined) errors.body = 'Provide status and/or note.';
    if (Object.keys(errors).length) return badRequest(res, errors);
    const updated = repo.updateEscalation(id, { status, note });
    if (!updated) return res.status(404).json({ error: 'not_found' });
    return res.json(updated);
  });

  // ---------- Wearable telemetry ----------
  // Accepted from a signed-in crew member (Bluetooth via this app) or a device gateway with the key.
  // With no TELEMETRY_KEY configured, gateways may post without one (development only).
  api.post('/telemetry', (req, res) => {
    const p = req.body ?? {};
    const viaKey = keyMatches(req.get('x-telemetry-key'), telemetryKey);
    if (!viaKey) {
      if (req.user) {
        if (typeof p.crewId === 'string' && !canAccessCrew(req.user, p.crewId)) return forbidden(res);
      } else if (telemetryKey) {
        return res.status(401).json({ error: 'unauthorized', message: 'Sign in, or send a valid x-telemetry-key header.' });
      }
    }
    const errors = validateTelemetryPayload(p);
    if (!errors.length && !repo.getCrew(p.crewId)) errors.push('Unknown crewId.');
    const future = (p.samples || []).some((s) => s && s.ts && new Date(s.ts).getTime() > Date.now() + MAX_FUTURE_MS);
    if (future) errors.push('Sample timestamps cannot be in the future.');
    if (errors.length) return badRequest(res, errors);
    const deviceName = typeof p.deviceName === 'string' && p.deviceName.trim() ? p.deviceName.trim().slice(0, 80) : p.deviceId;
    const kind = ['bluetooth', 'gateway'].includes(p.kind) ? p.kind : 'gateway';
    const saved = repo.insertTelemetry(p.crewId, p.deviceId.slice(0, 80), deviceName, kind, p.samples);
    for (const s of saved) bus.emit('sample', s);
    return res.status(202).json({ accepted: saved.length });
  });

  api.get('/telemetry', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.query.crewId ? String(req.query.crewId) : '');
    if (!crewId) return undefined;
    const since = req.query.since ? new Date(String(req.query.since)) : new Date(Date.now() - 2 * 3_600_000);
    if (Number.isNaN(since.getTime())) return badRequest(res, { since: 'since must be an ISO date.' });
    const metric = req.query.metric ? String(req.query.metric) : null;
    return res.json({ crewId, since: since.toISOString(), samples: repo.telemetrySince(crewId, since.toISOString(), metric) });
  });

  api.get('/telemetry/latest', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.query.crewId ? String(req.query.crewId) : '');
    if (!crewId) return undefined;
    return res.json({ crewId, latest: repo.telemetryLatest(crewId), devices: repo.listDevices(crewId) });
  });

  // Server-Sent Events: live samples and new log entries for one crew member.
  api.get('/telemetry/stream', requireAuth, (req, res) => {
    const crewId = crewFor(req, res, req.query.crewId ? String(req.query.crewId) : '');
    if (!crewId) return undefined;
    res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');
    res.write(`event: hello\ndata: ${JSON.stringify({ crewId, time: new Date().toISOString() })}\n\n`);
    const onSample = (s) => s.crewId === crewId && res.write(`event: sample\ndata: ${JSON.stringify(s)}\n\n`);
    const onReading = (r) => r.crewId === crewId && res.write(`event: reading\ndata: ${JSON.stringify(r)}\n\n`);
    bus.on('sample', onSample);
    bus.on('reading', onReading);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      bus.off('sample', onSample);
      bus.off('reading', onReading);
    });
    return undefined;
  });

  // ---------- Real NASA data (public) ----------
  api.get('/space-weather', async (req, res) => {
    try {
      res.json(await getSpaceWeather({ ...spaceWeatherDeps, force: req.query.refresh === '1' }));
    } catch (err) {
      res.status(503).json({ error: 'space_weather_unavailable', message: err.message });
    }
  });

  api.get('/nasa/radlab', (_req, res) => {
    const storm = readJson('radlab-msl-mars-may2024.json');
    const reference = readJson('radlab-reference.json');
    if (!storm || !reference) return res.status(503).json({ error: 'data_missing', message: 'Run npm run data:nasa' });
    return res.json({ storm, reference });
  });

  // ---------- Assistant ----------
  const assistantLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: rateLimitMax ?? (Number(process.env.ASSISTANT_RATE_LIMIT) || 20),
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: { error: 'rate_limited', message: 'Too many assistant requests. Try again in a minute.' },
  });

  api.post('/assistant', requireAuth, assistantLimiter, async (req, res) => {
    const { question, context } = req.body ?? {};
    if (typeof question !== 'string' || !question.trim()) return badRequest(res, { question: 'question is required.' });
    if (question.length > 1000) return badRequest(res, { question: 'question must be 1000 characters or fewer.' });
    try {
      // Only an astronaut's own record is offered to the readings tool; other roles get no personal data.
      const crewId = req.user?.role === 'astronaut' ? req.user.crewId : null;
      return res.json(await answerQuestion({ question: question.trim(), context, crewId }, assistantConfig, { repo, ...assistantDeps }));
    } catch (err) {
      console.error('[assistant] unexpected error', err);
      return res.status(500).json({ error: 'assistant_failed' });
    }
  });

  app.use('/api', api);
  app.use('/api', (_req, res) => res.status(404).json({ error: 'not_found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'invalid_json' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'payload_too_large' });
    console.error(err);
    return res.status(500).json({ error: 'internal_error' });
  });

  app.locals.bus = bus;
  return app;
}
