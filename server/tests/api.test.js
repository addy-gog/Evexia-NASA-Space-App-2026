import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import http from 'node:http';
import request from 'supertest';
import Anthropic from '@anthropic-ai/sdk';
import { createApp } from '../app.js';
import { seed } from '../seed.js';
import { clearSpaceWeatherCache } from '../lib/spaceWeather.js';
import { buildEscalationReport } from '../../client/src/lib/escalation.js';
import { evaluateCurrent } from '../../client/src/lib/evaluate.js';

let repo;
let app;
let sx; // signed-in flight surgeon (can access every crew record)

/** A supertest agent signed in as `username` (demo password = Capitalised-2026). */
export async function signIn(appX, username) {
  const agent = request.agent(appX);
  const pw = username === 'surgeon' ? 'Surgeon-2026' : `${username[0].toUpperCase()}${username.slice(1)}-2026`;
  const res = await agent.post('/api/auth/login').send({ username, password: pw });
  if (res.status !== 200) throw new Error(`login failed for ${username}: ${res.status}`);
  return agent;
}
const offlineConfig = { apiKey: '', model: 'claude-sonnet-5-5', maxTokens: 500, timeoutMs: 2000 };
const nowIso = () => new Date().toISOString();

beforeAll(async () => {
  ({ repo } = seed({ dbPath: ':memory:', days: 21 }));
  app = createApp({ repo, driver: 'test', assistantConfig: offlineConfig, rateLimitMax: 1000, loginRateLimitMax: 1000 });
  sx = await signIn(app, 'surgeon');
});

const valid = () => ({ crewId: 'c1', ts: nowIso(), hr: 70, sys: 118, dia: 76, glucose: 90, temp: 36.8, sleep: 7.5, radiation: 0.48, environment: 'marsTransit', notes: 'Fasting, before exercise.' });

describe('health and routing', () => {
  it('GET /api/health reports offline assistant and open telemetry', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ok', assistant: 'offline', telemetryAuth: 'open' });
  });
  it('unknown API route → 404 JSON', async () => {
    expect((await request(app).get('/api/nope')).status).toBe(404);
  });
});

describe('log entries (timestamped readings)', () => {
  it('seed created 21 days of sample history with timestamps and notes', async () => {
    const res = await sx.get('/api/readings?crewId=c1');
    expect(res.status).toBe(200);
    expect(res.body.readings.length).toBeGreaterThanOrEqual(42); // 21 past days × 2, plus today's once their time has passed
    const r = res.body.readings[0];
    expect(r.source).toBe('sample');
    expect(new Date(r.ts).toString()).not.toBe('Invalid Date');
    expect(res.body.readings.some((x) => x.spe)).toBe(true);
    expect(res.body.readings.every((x) => typeof x.notes === 'string' && x.notes.length > 0)).toBe(true);
  });
  let created;
  it('POST valid entry → 201 with id, ts, notes and source', async () => {
    const res = await sx.post('/api/readings').send(valid());
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ crewId: 'c1', hr: 70, radiation: 0.48, source: 'manual', notes: 'Fasting, before exercise.' });
    expect(res.body.id).toBeTypeOf('string');
    created = res.body;
  });
  it('POST with a client id is idempotent (re-send → 200, same entry)', async () => {
    const body = { ...valid(), id: 'client-uuid-1', hr: 71 };
    expect((await sx.post('/api/readings').send(body)).status).toBe(201);
    const again = await sx.post('/api/readings').send({ ...body, hr: 72 });
    expect(again.status).toBe(200);
    expect(again.body.hr).toBe(72);
  });
  it('POST partial wearable entry → 201', async () => {
    const res = await sx.post('/api/readings').send({ crewId: 'c1', ts: nowIso(), hr: 64, source: 'wearable', device: 'Polar H10' });
    expect(res.status).toBe(201);
    expect(res.body.device).toBe('Polar H10');
  });
  it.each([
    [{ ...valid(), ts: undefined }, 'ts'],
    [{ ...valid(), ts: 'yesterday' }, 'ts'],
    [{ ...valid(), ts: new Date(Date.now() + 3_600_000).toISOString() }, 'ts'],
    [{ ...valid(), hr: 'fast' }, 'hr'],
    [{ ...valid(), hr: 400 }, 'hr'],
    [{ ...valid(), sys: 80, dia: 95 }, 'dia'],
    [{ ...valid(), environment: 'jupiter' }, 'environment'],
    [{ ...valid(), source: 'robot' }, 'source'],
    [{ ...valid(), notes: 'x'.repeat(2001) }, 'notes'],
    [{ crewId: 'c1', ts: nowIso() }, 'reading'],
  ])('POST invalid payload → 400 (%#)', async (body, field) => {
    const res = await sx.post('/api/readings').send(body);
    expect(res.status).toBe(400);
    expect(res.body.details).toHaveProperty(field);
  });
  it('unknown crew member → 404', async () => {
    expect((await sx.post('/api/readings').send({ ...valid(), crewId: 'nobody' })).status).toBe(404);
  });
  it('id belonging to another crew member → 409', async () => {
    const res = await sx.post('/api/readings').send({ ...valid(), crewId: 'c2', id: 'client-uuid-1' });
    expect(res.status).toBe(409);
  });
  it('malformed JSON → 400 invalid_json', async () => {
    const res = await sx.post('/api/readings').set('Content-Type', 'application/json').send('{bad');
    expect(res.body.error).toBe('invalid_json');
  });
  it('GET filters by ISO time range, newest first', async () => {
    const from = new Date(Date.now() - 3 * 86_400_000).toISOString();
    const res = await sx.get(`/api/readings?crewId=c1&from=${from}`);
    expect(res.body.readings.every((r) => r.ts >= from)).toBe(true);
    const ts = res.body.readings.map((r) => r.ts);
    expect([...ts].sort().reverse()).toEqual(ts);
  });
  it('GET without crewId / bad range → 400', async () => {
    expect((await sx.get('/api/readings')).status).toBe(400);
    expect((await sx.get('/api/readings?crewId=c1&from=2026-02-01&to=2026-01-01')).status).toBe(400);
    expect((await sx.get('/api/readings?crewId=c1&from=nope')).status).toBe(400);
  });
  it('DELETE removes an entry; unknown → 404', async () => {
    expect((await sx.delete(`/api/readings/${created.id}?crewId=c1`)).status).toBe(204);
    expect((await sx.delete(`/api/readings/${created.id}?crewId=c1`)).status).toBe(404);
    expect((await sx.delete('/api/readings/x')).status).toBe(400);
  });
});

describe('baseline', () => {
  it('GET seeded baseline; PUT merges; invalid → 400; unknown → 404', async () => {
    expect((await sx.get('/api/baseline/c1')).body.hr).toBe(62);
    const res = await sx.put('/api/baseline/c1').send({ hr: 58, sleep: 8 });
    expect(res.body).toMatchObject({ hr: 58, sleep: 8, sys: 116 });
    expect((await sx.put('/api/baseline/c1').send({ hr: -5 })).status).toBe(400);
    expect((await sx.put('/api/baseline/zz').send({ hr: 60 })).status).toBe(404);
  });
});

describe('crew status (flight surgeon)', () => {
  it('lists 5 crew with profile, portrait and status from their latest logs', async () => {
    const res = await sx.get('/api/crew');
    expect(res.body.crew).toHaveLength(5);
    expect(res.body.crew[0]).toMatchObject({ id: 'c1', name: 'Cdr. Ada Okafor', avatar: '/avatars/c1.svg', bloodType: 'O+' });
    expect(res.body.crew[0].age).toBeGreaterThan(30);
    expect(res.body.crew.find((c) => c.id === 'c5').severities.temp).toBe('amber');
    const c4 = res.body.crew.find((c) => c.id === 'c4');
    expect(c4.lastLogAt).toBeTruthy();
    expect(c4.severities.hr).toBe('green');
    expect(c4.values.hr.ts).toBeTruthy();
  });
});

describe('escalations', () => {
  const report = (priority = 'routine') => {
    const logs = [{ id: 'x', crewId: 'c1', ts: nowIso(), glucose: 130, environment: 'marsTransit', source: 'manual' }];
    const status = evaluateCurrent(logs, { environment: 'marsTransit' });
    return buildEscalationReport({ crew: { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander' }, status, environment: 'marsTransit', delaySeconds: 720, priority });
  };
  let id;
  it('POST creates a report → 201', async () => {
    const res = await sx.post('/api/escalations').send(report());
    expect(res.status).toBe(201);
    expect(res.body.payload.severities.glucose).toBe('red');
    id = res.body.id;
  });
  it('emergency reports are listed first', async () => {
    await sx.post('/api/escalations').send(report('emergency'));
    const res = await sx.get('/api/escalations');
    expect(res.body.escalations[0].priority).toBe('emergency');
  });
  it('invalid → 400; PATCH reviewed + note; invalid patch → 400; unknown → 404', async () => {
    expect((await sx.post('/api/escalations').send({ foo: 1 })).status).toBe(400);
    const p = await sx.patch(`/api/escalations/${id}`).send({ status: 'reviewed', note: 'Repeat fasting test tomorrow.' });
    expect(p.body).toMatchObject({ status: 'reviewed', note: 'Repeat fasting test tomorrow.' });
    expect((await sx.patch(`/api/escalations/${id}`).send({ status: 'done' })).status).toBe(400);
    expect((await sx.patch('/api/escalations/99999').send({ status: 'reviewed' })).status).toBe(404);
  });
});

describe('wearable telemetry', () => {
  const payload = (samples) => ({ crewId: 'c1', deviceId: 'watch-01', deviceName: 'Crew smartwatch', samples });
  it('POST samples → 202 and they appear in latest + series + device list', async () => {
    const ts = nowIso();
    const res = await sx.post('/api/telemetry').send(payload([{ metric: 'hr', value: 72, ts }, { metric: 'temp', value: 36.7, ts }]));
    expect(res.status).toBe(202);
    expect(res.body.accepted).toBe(2);
    const latest = await sx.get('/api/telemetry/latest?crewId=c1');
    expect(latest.body.latest.find((s) => s.metric === 'hr')).toMatchObject({ value: 72, deviceName: 'Crew smartwatch' });
    expect(latest.body.devices[0]).toMatchObject({ deviceId: 'watch-01', kind: 'gateway' });
    const series = await sx.get('/api/telemetry?crewId=c1&metric=hr');
    expect(series.body.samples.at(-1).value).toBe(72);
  });
  it.each([
    [{ deviceId: 'w', samples: [{ metric: 'hr', value: 70 }] }],
    [payload([])],
    [payload([{ metric: 'spo2', value: 97 }])],
    [payload([{ metric: 'hr', value: 'fast' }])],
    [payload([{ metric: 'hr', value: 70, ts: new Date(Date.now() + 3_600_000).toISOString() }])],
    [{ ...payload([{ metric: 'hr', value: 70 }]), crewId: 'zz' }],
  ])('invalid ingest → 400 (%#)', async (body) => {
    expect((await sx.post('/api/telemetry').send(body)).status).toBe(400);
  });
  it('requires x-telemetry-key when TELEMETRY_KEY is set', async () => {
    const secured = createApp({ repo, assistantConfig: offlineConfig, telemetryKey: 's3cret', rateLimitMax: 1000 });
    const body = payload([{ metric: 'hr', value: 70 }]);
    expect((await request(secured).post('/api/telemetry').send(body)).status).toBe(401);
    expect((await request(secured).post('/api/telemetry').set('x-telemetry-key', 'wrong!').send(body)).status).toBe(401);
    expect((await request(secured).post('/api/telemetry').set('x-telemetry-key', 's3cret').send(body)).status).toBe(202);
  });
  it('GET without crewId → 400', async () => {
    expect((await sx.get('/api/telemetry')).status).toBe(400);
    expect((await sx.get('/api/telemetry/latest')).status).toBe(400);
    expect((await sx.get('/api/telemetry/stream')).status).toBe(400);
  });
});

describe('live stream (Server-Sent Events)', () => {
  let server;
  let base;
  beforeAll(async () => {
    server = http.createServer(app);
    await new Promise((r) => server.listen(0, r));
    base = `http://127.0.0.1:${server.address().port}`;
  });
  afterAll(() => new Promise((r) => server.close(r)));

  it('pushes ingested samples and new log entries to subscribers of that crew member', async () => {
    const login = await fetch(`${base}/api/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ username: 'okafor', password: 'Okafor-2026' }) });
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const ctrl = new AbortController();
    const res = await fetch(`${base}/api/telemetry/stream?crewId=c1`, { signal: ctrl.signal, headers: { cookie } });
    expect(res.headers.get('content-type')).toMatch(/text\/event-stream/);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let text = '';
    const readUntil = async (pattern) => {
      const deadline = Date.now() + 5000;
      while (!pattern.test(text) && Date.now() < deadline) {
        const { value, done } = await reader.read();
        if (done) break;
        text += dec.decode(value);
      }
    };
    await readUntil(/event: hello/);
    await sx.post('/api/telemetry').send({ crewId: 'c2', deviceId: 'other', samples: [{ metric: 'hr', value: 55 }] });
    await sx.post('/api/telemetry').send({ crewId: 'c1', deviceId: 'strap', deviceName: 'Polar H10', samples: [{ metric: 'hr', value: 88 }] });
    await readUntil(/"value":88/);
    await sx.post('/api/readings').send({ crewId: 'c1', ts: nowIso(), hr: 66, source: 'wearable' });
    await readUntil(/event: reading/);
    ctrl.abort();
    expect(text).toMatch(/event: sample\ndata: .*"value":88/);
    expect(text).not.toMatch(/"value":55/); // other crew member's data is not streamed
    expect(text).toMatch(/event: reading\ndata: .*"hr":66/);
  });
});

describe('real NASA data', () => {
  it('space weather from DONKI (mocked live response)', async () => {
    clearSpaceWeatherCache();
    const fetchImpl = vi.fn(async (url) => ({
      ok: true,
      text: async () =>
        JSON.stringify(
          url.includes('/SEP')
            ? [{ sepID: '2024-05-10T12:59:00-SEP-001', eventTime: '2024-05-10T12:59Z', instruments: [{ displayName: 'SOHO: COSTEP 15.8-39.8 MeV' }], link: 'https://ccmc.gsfc.nasa.gov/DONKI/view/SEP/30675/-1', linkedEvents: null }]
            : [{ flrID: 'f1', beginTime: '2024-05-14T16:46Z', peakTime: '2024-05-14T16:51Z', endTime: '2024-05-14T17:02Z', classType: 'X8.7', sourceLocation: 'S18W89', activeRegionNum: 13664, link: 'x' }],
        ),
    }));
    const a = createApp({ repo, assistantConfig: offlineConfig, spaceWeatherDeps: { fetchImpl }, rateLimitMax: 1000 });
    const res = await request(a).get('/api/space-weather?refresh=1');
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(true);
    expect(res.body.sep[0]).toMatchObject({ id: '2024-05-10T12:59:00-SEP-001', instruments: ['SOHO: COSTEP 15.8-39.8 MeV'] });
    expect(res.body.flares[0]).toMatchObject({ classType: 'X8.7', sourceLocation: 'S18W89' });
    expect(fetchImpl.mock.calls[0][0]).toMatch(/ccmc\.gsfc\.nasa\.gov\/DONKI\/WS\/get\/(SEP|FLR)\?startDate=\d{4}-\d{2}-\d{2}&endDate=/);
  });
  it('falls back to the bundled DONKI snapshot when offline', async () => {
    clearSpaceWeatherCache();
    const fetchImpl = vi.fn().mockRejectedValue(new Error('network down'));
    const a = createApp({ repo, assistantConfig: offlineConfig, spaceWeatherDeps: { fetchImpl }, rateLimitMax: 1000 });
    const res = await request(a).get('/api/space-weather?refresh=1');
    expect(res.status).toBe(200);
    expect(res.body.live).toBe(false);
    expect(res.body.error).toMatch(/bundled snapshot/);
    expect(res.body.may2024.sep.length).toBeGreaterThan(0);
  });
  it('serves the bundled RadLab measurements (Curiosity May 2024 storm)', async () => {
    const res = await sx.get('/api/nasa/radlab');
    expect(res.status).toBe(200);
    expect(res.body.storm.summary.peakDay).toBe('2024-05-20');
    expect(res.body.storm.summary.peakDayTimesBaseline).toBeGreaterThan(10);
    expect(res.body.storm.sourceUrl).toMatch(/visualization\.osdr\.nasa\.gov\/radlab\/api/);
    expect(res.body.reference.references.length).toBeGreaterThanOrEqual(3);
  });
});

describe('assistant', () => {
  const context = { environment: 'marsTransit', delaySeconds: 720, reading: { hr: 96, glucose: 130 }, missionDay: 61 };

  it('no API key → offline rule-based fallback', async () => {
    const res = await sx.post('/api/assistant').send({ question: 'Why is my heart rate amber?', context });
    expect(res.body).toMatchObject({ mode: 'offline', reason: 'no_api_key' });
    expect(res.body.answer).toMatch(/Resting heart rate is CAUTION/);
  });
  it('missing / too long question → 400', async () => {
    expect((await sx.post('/api/assistant').send({ context })).status).toBe(400);
    expect((await sx.post('/api/assistant').send({ question: 'x'.repeat(1001) })).status).toBe(400);
  });
  it('upstream unreachable → offline fallback, no crash', async () => {
    const unreachable = createApp({ repo, assistantConfig: { apiKey: 'sk-test', model: 'claude-sonnet-5-5', maxTokens: 100, timeoutMs: 1500, baseURL: 'http://127.0.0.1:9' }, rateLimitMax: 1000 });
    const res = await (await signIn(unreachable, 'okafor')).post('/api/assistant').send({ question: 'What should I do about my sleep?', context });
    expect(res.body.mode).toBe('offline');
    expect(['unreachable', 'timeout']).toContain(res.body.reason);
  }, 20000);
  it('upstream 500 → offline fallback', async () => {
    const client = { beta: { messages: { create: vi.fn().mockRejectedValue(new Anthropic.InternalServerError(500, { error: 'x' }, 'boom', new Headers())) } } };
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client }, rateLimitMax: 1000 });
    expect((await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'glucose?', context })).body).toMatchObject({ mode: 'offline', reason: 'api_error_500' });
  });
  it('success → ai mode; red status, units and comms context reach the prompt; key never returned', async () => {
    const create = vi.fn().mockResolvedValue({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Escalate now.' }] });
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'secret-key' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });
    const res = await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'glucose?', context: { ...context, reading: { ...context.reading, radiation: 0.48 } } });
    expect(res.body).toMatchObject({ mode: 'ai', answer: 'Escalate now.' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret-key/);
    const params = create.mock.calls[0][0];
    expect(params.max_tokens).toBe(500);
    expect(params.system).toMatch(/Never diagnose/);
    expect(params.messages[0].content).toMatch(/Fasting blood glucose: 130 mg\/dL, RED/);
    expect(params.messages[0].content).toMatch(/0.48 mGy\/day measured ≈ 1.824 mSv\/day estimated/);
    expect(params.messages[0].content).toMatch(/self-care first/);
  });
  it('refusal → offline fallback; rate limit → 429', async () => {
    const client = { beta: { messages: { create: vi.fn().mockResolvedValue({ stop_reason: 'refusal', content: [] }) } } };
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client }, rateLimitMax: 1000 });
    expect((await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'sleep?', context })).body.reason).toBe('refusal');
    const limited = createApp({ repo, assistantConfig: offlineConfig, rateLimitMax: 2 });
    const la = await signIn(limited, 'okafor');
    for (let i = 0; i < 2; i += 1) await la.post('/api/assistant').send({ question: 'hi' });
    expect((await la.post('/api/assistant').send({ question: 'hi' })).status).toBe(429);
  });
});

describe('authentication and access control', () => {
  it('login succeeds with the demo password and sets an HttpOnly session cookie', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: 'Okafor', password: 'Okafor-2026' });
    expect(res.status).toBe(200);
    expect(res.body.user).toMatchObject({ username: 'okafor', role: 'astronaut', crewId: 'c1', avatar: '/avatars/c1.svg' });
    expect(res.body.crew).toMatchObject({ id: 'c1', role: 'Commander' });
    expect(res.headers['set-cookie'][0]).toMatch(/evexia_session=.+; Path=\/; HttpOnly; SameSite=Lax/);
    expect(JSON.stringify(res.body)).not.toMatch(/password|scrypt/);
  });
  it('wrong password / unknown user / bad body → 401 or 400', async () => {
    expect((await request(app).post('/api/auth/login').send({ username: 'okafor', password: 'nope' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: 'ghost', password: 'x' })).status).toBe(401);
    expect((await request(app).post('/api/auth/login').send({ username: 5 })).status).toBe(400);
  });
  it('passwords are stored hashed (scrypt), never in plain text', () => {
    const row = repo.userByUsername('okafor');
    expect(row.password_hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(row.password_hash).not.toContain('Okafor-2026');
  });
  it('me and logout', async () => {
    const a = await signIn(app, 'tanaka');
    expect((await a.get('/api/auth/me')).body.user).toMatchObject({ crewId: 'c3', role: 'astronaut' });
    expect((await a.post('/api/auth/logout')).status).toBe(204);
    expect((await a.get('/api/auth/me')).body.user).toBeNull();
  });
  it('health data requires sign-in', async () => {
    for (const [m, p] of [['get', '/api/readings?crewId=c1'], ['get', '/api/crew'], ['get', '/api/crew/c1'], ['get', '/api/escalations'], ['get', '/api/telemetry/latest?crewId=c1'], ['post', '/api/assistant']]) {
      expect((await request(app)[m](p).send({})).status, p).toBe(401);
    }
  });
  it('an astronaut sees only their own record and defaults to it', async () => {
    const a = await signIn(app, 'okafor');
    expect((await a.get('/api/readings')).body.crewId).toBe('c1');
    expect((await a.get('/api/readings?crewId=c2')).status).toBe(403);
    expect((await a.post('/api/readings').send({ crewId: 'c2', ts: new Date().toISOString(), hr: 70 })).status).toBe(403);
    expect((await a.post('/api/readings').send({ ts: new Date().toISOString(), hr: 70 })).body.crewId).toBe('c1');
    expect((await a.get('/api/crew/c2')).status).toBe(403);
    expect((await a.get('/api/crew/c1')).body.profile.name).toBe('Cdr. Ada Okafor');
    expect((await a.get('/api/crew')).status).toBe(403);
    expect((await a.patch('/api/escalations/1').send({ status: 'reviewed' })).status).toBe(403);
    expect((await a.put('/api/baseline/c2').send({ hr: 60 })).status).toBe(403);
    expect((await a.post('/api/telemetry').send({ crewId: 'c2', deviceId: 'x', samples: [{ metric: 'hr', value: 70 }] })).status).toBe(403);
    const esc = (await a.get('/api/escalations')).body.escalations;
    expect(esc.every((e) => e.crewId === 'c1')).toBe(true);
  });
  it('the flight surgeon sees every crew member, with profile, status, logs and devices', async () => {
    const res = await sx.get('/api/crew/c5');
    expect(res.status).toBe(200);
    expect(res.body.profile).toMatchObject({ name: 'Priya Nair', avatar: '/avatars/c5.svg', bloodType: 'AB+' });
    expect(res.body.status.severities.temp).toBe('amber');
    expect(res.body.readings.length).toBeGreaterThan(30);
    expect(res.body.readings[0].ts >= res.body.readings[1].ts).toBe(true);
    expect(res.body).toHaveProperty('devices');
    expect((await sx.get('/api/crew/zz')).status).toBe(404);
  });
  it('a signed-in crew member can stream Bluetooth samples even when a gateway key is required', async () => {
    const secured = createApp({ repo, assistantConfig: offlineConfig, telemetryKey: 's3cret', loginRateLimitMax: 1000 });
    const a = await signIn(secured, 'rivera');
    expect((await a.post('/api/telemetry').send({ crewId: 'c4', deviceId: 'ble-1', kind: 'bluetooth', samples: [{ metric: 'hr', value: 61 }] })).status).toBe(202);
  });
});
