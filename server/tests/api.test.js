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
  app = createApp({ repo, driver: 'test', assistantConfig: offlineConfig, rateLimitMax: 1000, loginRateLimitMax: 1000, linkTimeScale: 0 });
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
    const c1 = res.body.crew.find((c) => c.id === 'c1');
    expect(c1).toMatchObject({ name: 'Cdr. Ada Okafor', avatar: '/avatars/c1.svg', bloodType: 'O+' });
    expect(c1.age).toBeGreaterThan(30);
    expect(res.body.crew.find((c) => c.id === 'c5').severities.temp).toBe('amber');
    const c4 = res.body.crew.find((c) => c.id === 'c4');
    expect(c4.lastLogAt).toBeTruthy();
    expect(c4.severities.hr).toBe('green');
    expect(c4.values.hr.ts).toBeTruthy();
  });
  it('returns the crew as an IITT triage queue: highest priority first, with tier, ABCDE domain and target time', async () => {
    const { crew } = (await sx.get('/api/crew')).body;
    const priorities = crew.map((c) => c.triage.priority);
    expect(priorities).toEqual([...priorities].sort((a, b) => b - a));
    const c5 = crew.find((c) => c.id === 'c5'); // temperature amber in the seed
    expect(c5.triage).toMatchObject({ tier: 'amber', target: 'Within 60 min' });
    expect(c5.triage.top).toMatchObject({ letter: expect.any(String), label: expect.any(String) });
    for (const c of crew) if (c.triage.tier && c.triage.tier !== 'green') expect(c.score).toBeLessThanOrEqual(c.triage.cap);
  });
});

describe('Earth link API', () => {
  const report = (priority = 'routine') => {
    const logs = [{ id: 'x', crewId: 'c1', ts: nowIso(), glucose: 130, environment: 'marsTransit', source: 'manual' }];
    const status = evaluateCurrent(logs, { environment: 'marsTransit' });
    return buildEscalationReport({ crew: { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander' }, status, environment: 'marsTransit', delaySeconds: 720, priority });
  };

  it('blackout: the astronaut sees "waiting", the flight surgeon sees nothing; link up: it arrives', async () => {
    const me = await signIn(app, 'okafor');
    expect((await me.put('/api/link').send({ mode: 'blackout' })).body.mode).toBe('blackout');
    const sent = await me.post('/api/escalations').send(report('emergency'));
    expect(sent.status).toBe(201);
    expect(sent.body.link.step).toBe('waiting');
    expect((await me.get('/api/link')).body).toMatchObject({ mode: 'blackout', waiting: 1 });
    expect((await sx.get('/api/escalations')).body.escalations.some((e) => e.id === sent.body.id)).toBe(false);

    await me.put('/api/link').send({ mode: 'up' });
    const surgeon = (await sx.get('/api/escalations')).body.escalations.find((e) => e.id === sent.body.id);
    expect(surgeon).toBeTruthy();
    expect(surgeon.link.writtenAt).toBe(sent.body.payload.createdAt);
    expect(surgeon.link.arrivedAt).toBeTruthy();
    expect((await me.get('/api/escalations')).body.escalations.find((e) => e.id === sent.body.id).link.step).toBe('arrived');
  });

  it('the surgeon replies; the reply reaches the crew, the private note does not', async () => {
    const me = await signIn(app, 'okafor');
    const id = (await me.post('/api/escalations').send(report())).body.id;
    await sx.patch(`/api/escalations/${id}`).send({ note: 'ground-only note' });
    const r = await sx.post(`/api/escalations/${id}/reply`).send({ text: 'Drink water, retest fasting glucose tomorrow.' });
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('reviewed');
    const mine = (await me.get('/api/escalations')).body.escalations.find((e) => e.id === id);
    expect(mine.link.step).toBe('replied');
    expect(mine.link.reply.text).toBe('Drink water, retest fasting glucose tomorrow.');
    expect(JSON.stringify(mine)).not.toContain('ground-only note');
  });

  it('a report resent from the outbox with the same clientId is stored once', async () => {
    const me = await signIn(app, 'okafor');
    const body = { ...report(), clientId: 'outbox-test-1' };
    const first = await me.post('/api/escalations').send(body);
    const again = await me.post('/api/escalations').send(body);
    expect(first.status).toBe(201);
    expect(again.status).toBe(200);
    expect(again.body.id).toBe(first.body.id);
    expect((await me.get('/api/escalations')).body.escalations.filter((e) => e.payload.clientId === 'outbox-test-1')).toHaveLength(1);
    expect((await me.post('/api/escalations').send({ ...body, clientId: 'x'.repeat(81) })).status).toBe(400);
  });

  it('validates link changes and replies; astronauts cannot reply', async () => {
    const me = await signIn(app, 'okafor');
    expect((await me.put('/api/link').send({ mode: 'sideways' })).status).toBe(400);
    expect((await me.put('/api/link').send({ timeScale: 2 })).status).toBe(400);
    expect((await me.put('/api/link').send({})).status).toBe(400);
    expect((await me.post('/api/escalations/1/reply').send({ text: 'hi' })).status).toBe(403);
    expect((await sx.post('/api/escalations/1/reply').send({ text: '' })).status).toBe(400);
    expect((await sx.post('/api/escalations/99999/reply').send({ text: 'hi' })).status).toBe(404);
    await me.put('/api/link').send({ mode: 'up', timeScale: 0 });
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
    [payload([{ metric: 'co2', value: 0.4 }])], // not a body metric
    [payload([{ metric: 'hr', value: 'fast' }])],
    [payload([{ metric: 'hr', value: 70, ts: new Date(Date.now() + 3_600_000).toISOString() }])],
    [{ ...payload([{ metric: 'hr', value: 70 }]), crewId: 'zz' }],
  ])('invalid ingest → 400 (%#)', async (body) => {
    expect((await sx.post('/api/telemetry').send(body)).status).toBe(400);
  });
  it('accepts pulse-oximeter samples (blood oxygen, %)', async () => {
    expect((await sx.post('/api/telemetry').send(payload([{ metric: 'spo2', value: 97 }]))).status).toBe(202);
  });
  it('stores and returns blood oxygen on a log entry', async () => {
    const res = await sx.post('/api/readings').send({ id: 'spo2-test', crewId: 'c1', ts: new Date().toISOString(), spo2: 93, hr: 70, environment: 'station' });
    expect(res.status).toBeLessThan(300);
    expect(res.body.spo2).toBe(93);
    expect(res.body.hr).toBe(70); // values land in the right columns
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
  it('Claude gets the IITT/ABCDE method in the knowledge pack and this astronaut\'s triage in the context', async () => {
    const create = vi.fn().mockResolvedValue({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });
    await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'Why is my score low?', context });
    const params = create.mock.calls[0][0];
    const pack = params.system[1].text;
    expect(pack).toMatch(/Interagency Integrated Triage Tool/);
    expect(pack).toMatch(/Rank 2, C Circulation: heart rate 12\.5%, blood pressure 12\.5%\. Amber caps the overall score at 76%, red at 45%/);
    expect(pack).toMatch(/Rank 1, A\/B Airway & breathing: blood oxygen 25%\. Amber caps the overall score at 72%, red at 39%/);
    expect(pack).not.toMatch(/blood oxygen 25% \(not measured yet\)/);
    expect(params.system[0].text).toMatch(/Triage order/);
    // hr 96 amber (C) + glucose 130 red (D): red comes first, glucose sets the cap (D red = 50 %).
    const prompt = JSON.stringify(params.messages);
    expect(prompt).toMatch(/Triage: IITT Red \(Emergent\), target immediate/);
    expect(prompt).toMatch(/Triage order, most urgent first: glucose \(red, ABCDE D[^;]*\); heart rate \(amber, ABCDE C/);
  });
  it('offline answers explain the score and triage', async () => {
    const res = await sx.post('/api/assistant').send({ question: 'Explain my score', context });
    expect(res.body.mode).toBe('offline');
    expect(res.body.answer).toMatch(/IITT Red \(Emergent\)/);
    expect(res.body.answer).toMatch(/1\. Glucose \(critical\): ABCDE D/);
    expect(res.body.answer).toMatch(/2\. Heart rate \(caution\): ABCDE C/);
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
    // Rules first, then the knowledge pack carrying the cache breakpoint.
    expect(params.system[0].text).toMatch(/Never diagnose/);
    expect(params.system[1].text).toMatch(/<evexia_knowledge>/);
    expect(params.system[1].text).toMatch(/600 mSv/);
    expect(params.system[1].text).toMatch(/Glucose: lab normal 65–99/);
    expect(params.system[1].cache_control).toEqual({ type: 'ephemeral' });
    expect(params.tools.map((t) => t.name)).toEqual([
      'get_radiation_reference', 'get_inspiration4_lab_data', 'get_my_recent_readings',
      'propose_readings', 'propose_symptom_note', 'propose_report', 'record_knowledge_gap',
    ]);
    expect(params.tools.every((t) => t.strict && t.input_schema.additionalProperties === false)).toBe(true);
    // Safety ladder and Option B are in the rules.
    expect(params.system[0].text).toMatch(/Danger signs first/);
    expect(params.system[0].text).toMatch(/General advice, not from Evexia's NASA sources:/);
    expect(params.system[0].text).toMatch(/Never name a medicine, a dose, or a condition/);
    expect(params.system[0].text).toMatch(/Not a diagnosis\. Your crew medical officer decides\./);
    expect(params.messages[0].content).toMatch(/Safety screen: no danger-sign keywords/);
    expect(res.body).toMatchObject({ actions: [], emergency: [], gapRecorded: false });
    expect(params.messages[0].content).toMatch(/Fasting blood glucose: 130 mg\/dL, RED/);
    expect(params.messages[0].content).toMatch(/0.48 mGy\/day measured ≈ 1.824 mSv\/day estimated/);
    expect(params.messages[0].content).toMatch(/self-care first/);
  });
  it('tool loop: Claude looks up real NASA data, then answers; results go back in one user turn', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({
        stop_reason: 'tool_use',
        content: [
          { type: 'thinking', thinking: '', signature: 'sig' },
          { type: 'tool_use', id: 't1', name: 'get_radiation_reference', input: { environment: 'marsTransit' } },
          { type: 'tool_use', id: 't2', name: 'get_inspiration4_lab_data', input: { test: 'glucose' } },
        ],
      })
      .mockResolvedValueOnce({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: 'Within the measured range [NASA RadLab].' }] });
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });
    const res = await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'Is my radiation normal?', context });
    expect(res.body).toMatchObject({ mode: 'ai', answer: 'Within the measured range [NASA RadLab].', toolsUsed: ['get_radiation_reference', 'get_inspiration4_lab_data'] });
    const second = create.mock.calls[1][0].messages;
    expect(second).toHaveLength(3);
    expect(second[1].content[0]).toMatchObject({ type: 'thinking' }); // assistant turn passed back unchanged
    const results = second[2].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(['t1', 't2']);
    expect(results[0].content).toMatch(/Liulin-MO on ExoMars TGO/);
    expect(results[0].content).toMatch(/V1 4030/);
    expect(JSON.parse(results[1].content).labNormalRanges).toEqual(['65–99']);
  });
  it('readings tool returns only the signed-in astronaut\'s own logs; surgeons get none', async () => {
    const ask = (input) =>
      vi
        .fn()
        .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'r1', name: 'get_my_recent_readings', input }] })
        .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'ok' }] });
    const create = ask({ days: 7 });
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });
    await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'Has my sleep been falling?', context });
    const own = JSON.parse(create.mock.calls[1][0].messages[2].content[0].content);
    expect(own.count).toBeGreaterThan(0);
    expect(own.readings.length).toBe(own.count);
    const surgeonCreate = ask({ days: 7 });
    const b = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create: surgeonCreate } } } }, rateLimitMax: 1000 });
    await (await signIn(b, 'surgeon')).post('/api/assistant').send({ question: 'sleep?', context });
    expect(JSON.parse(surgeonCreate.mock.calls[1][0].messages[2].content[0].content).error).toMatch(/No crew member/);
  });
  it('tool loop stops after 4 rounds and falls back instead of looping', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 'x', name: 'get_radiation_reference', input: { environment: 'station' } }] });
    const a = createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });
    const res = await (await signIn(a, 'okafor')).post('/api/assistant').send({ question: 'radiation?', context });
    expect(create).toHaveBeenCalledTimes(5);
    expect(res.body).toMatchObject({ mode: 'offline', reason: 'too_many_tool_calls' });
  });

  // ---------- Photos, safety ladder, proposals ----------
  const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
  const twoStep = (calls, finalText = 'Done.') => {
    const create = vi.fn();
    create.mockResolvedValueOnce({ stop_reason: 'tool_use', content: calls.map((c, i) => ({ type: 'tool_use', id: `p${i}`, ...c })) });
    create.mockResolvedValueOnce({ model: 'claude-sonnet-5-5', stop_reason: 'end_turn', content: [{ type: 'text', text: finalText }] });
    return create;
  };
  const withClient = (create) => createApp({ repo, assistantConfig: { ...offlineConfig, apiKey: 'k' }, assistantDeps: { client: { beta: { messages: { create } } } }, rateLimitMax: 1000 });

  it('a photo reaches Claude as an image block before the text; photo-only messages are allowed', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'I see a screen.' }] });
    const res = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: '', context, image: { mediaType: 'image/png', data: PNG_1PX } });
    expect(res.status).toBe(200);
    const content = create.mock.calls[0][0].messages[0].content;
    expect(content[0]).toEqual({ type: 'image', source: { type: 'base64', media_type: 'image/png', data: PNG_1PX } });
    expect(content[1].text).toMatch(/The astronaut attached a photo/);
    expect(content[1].text).toMatch(/What can you see in this photo\?/);
  });
  it('bad photos are rejected: wrong type, not base64, too large; a photo offline gets a plain explanation', async () => {
    const agent = await signIn(app, 'okafor');
    expect((await agent.post('/api/assistant').send({ question: 'x', image: { mediaType: 'application/pdf', data: PNG_1PX } })).status).toBe(400);
    expect((await agent.post('/api/assistant').send({ question: 'x', image: { mediaType: 'image/png', data: 'not base64!' } })).status).toBe(400);
    expect((await agent.post('/api/assistant').send({ question: 'x', image: { mediaType: 'image/png', data: 'A'.repeat(2_000_004) } })).status).toBe(400);
    const off = await agent.post('/api/assistant').send({ question: 'read this', context, image: { mediaType: 'image/png', data: PNG_1PX } });
    expect(off.body.mode).toBe('offline');
    expect(off.body.answer).toMatch(/cannot look at photos/);
  });
  it('device photo: proposed readings come back as a card, converted and checked by the server, never saved', async () => {
    const before = repo.readingsSince('c1', new Date(0).toISOString()).length;
    const create = twoStep([{ name: 'propose_readings', input: { device: 'glucose_meter', hr: null, sys: 300, dia: null, glucose: 5.5, glucose_unit: 'mmol/L', temp: 100.4, temp_unit: 'F', unreadable: 'time' } }]);
    const res = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: 'log this', context, image: { mediaType: 'image/png', data: PNG_1PX } });
    expect(res.body.actions).toEqual([
      { type: 'readings', device: 'glucose_meter', values: { glucose: 99, temp: 38 }, unreadable: 'time', rejected: ['sys'], converted: { glucose: true, temp: true } },
    ]);
    // Claude is told it is only a card.
    expect(JSON.parse(create.mock.calls[1][0].messages[2].content[0].content).instruction).toMatch(/Nothing is saved/);
    expect(repo.readingsSince('c1', new Date(0).toISOString()).length).toBe(before);
  });
  it('text Claude writes alongside a tool call is kept, not just the last turn', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ stop_reason: 'tool_use', content: [{ type: 'text', text: 'I read 128/82 and pulse 74.' }, { type: 'tool_use', id: 'p0', name: 'propose_readings', input: { device: 'blood_pressure_monitor', hr: 74, sys: 128, dia: 82, glucose: null, glucose_unit: 'none', temp: null, temp_unit: 'none', unreadable: '' } }] })
      .mockResolvedValueOnce({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Not a diagnosis. Your crew medical officer decides.' }] });
    const res = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: 'log this', context, image: { mediaType: 'image/png', data: PNG_1PX } });
    expect(res.body.answer).toBe('I read 128/82 and pulse 74.\n\nNot a diagnosis. Your crew medical officer decides.');
    expect(res.body.actions[0].values).toEqual({ hr: 74, sys: 128, dia: 82 });
  });
  it('unreadable device photo: no card, and Claude is told to ask for typed numbers', async () => {
    const create = twoStep([{ name: 'propose_readings', input: { device: 'other', hr: null, sys: null, dia: null, glucose: null, glucose_unit: 'none', temp: null, temp_unit: 'none', unreadable: 'all of it' } }]);
    const res = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: 'log this', context, image: { mediaType: 'image/png', data: PNG_1PX } });
    expect(res.body.actions).toEqual([]);
    expect(JSON.parse(create.mock.calls[1][0].messages[2].content[0].content).error).toMatch(/could not read the screen/);
  });
  it('not covered by NASA data: gap recorded server-side, symptom note and report proposed, nothing sent', async () => {
    const escBefore = repo.listEscalations().length;
    const create = twoStep([
      { name: 'record_knowledge_gap', input: { topic: 'skin rash', question: 'Red itchy patch on forearm' } },
      { name: 'propose_symptom_note', input: { summary: 'Red itchy patch, left forearm', details: 'Since yesterday, coin-sized.', recheck_hours: 200 } },
      { name: 'propose_report', input: { priority: 'urgent', note: 'Red patch, watching it.' } },
    ]);
    const res = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: 'I have a red itchy patch on my arm', context });
    expect(res.body.gapRecorded).toBe(true);
    expect(res.body.actions).toEqual([
      { type: 'symptom_note', summary: 'Red itchy patch, left forearm', details: 'Since yesterday, coin-sized.', recheckHours: 48 },
      { type: 'report', priority: 'routine', note: 'Red patch, watching it.' },
    ]);
    expect(repo.listEscalations().length).toBe(escBefore);
    const gaps = (await (await signIn(app, 'okafor')).get('/api/knowledge-gaps')).body.gaps;
    expect(gaps[0]).toMatchObject({ crewId: 'c1', topic: 'skin rash', question: 'Red itchy patch on forearm' });
    expect((await sx.get('/api/knowledge-gaps')).body.gaps.some((g) => g.topic === 'skin rash')).toBe(true);
    expect((await (await signIn(app, 'marchetti')).get('/api/knowledge-gaps')).body.gaps.some((g) => g.topic === 'skin rash')).toBe(false);
  });
  it('safety screen: danger signs are flagged before Claude, online and offline; negations are not', async () => {
    const off = await (await signIn(app, 'okafor')).post('/api/assistant').send({ question: 'I have chest pain and feel faint', context });
    expect(off.body.emergency.map((e) => e.id)).toEqual(['chest_pain']);
    expect(off.body.answer).toMatch(/^Possible danger sign: chest pain or pressure\. Open emergency mode/);
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Open emergency mode now.' }] });
    const on = await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: "I can't breathe properly", context });
    expect(on.body.emergency.map((e) => e.id)).toEqual(['breathing']);
    expect(create.mock.calls[0][0].messages[0].content).toMatch(/Safety screen: possible danger signs in the message \(trouble breathing\)/);
    const calm = await (await signIn(app, 'okafor')).post('/api/assistant').send({ question: 'No chest pain, just tired', context });
    expect(calm.body.emergency).toEqual([]);
  });
  it('conversation history: earlier turns go first so Claude can follow up; leading assistant turns are dropped', async () => {
    const create = vi.fn().mockResolvedValue({ stop_reason: 'end_turn', content: [{ type: 'text', text: 'Thanks.' }] });
    const history = [
      { role: 'assistant', text: 'Welcome summary' },
      { role: 'user', text: 'Red patch on my arm' },
      { role: 'assistant', text: 'When did it start?' },
      { role: 'bogus', text: 'ignored' },
    ];
    await (await signIn(withClient(create), 'okafor')).post('/api/assistant').send({ question: 'Yesterday, it itches', context, history });
    const msgs = create.mock.calls[0][0].messages;
    expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[0].content).toBe('Red patch on my arm');
    expect(msgs[2].content).toMatch(/Astronaut message: Yesterday, it itches/);
  });

describe('symptom notes', () => {
  it('astronaut saves a note with a recheck time, lists it, marks it done; others cannot touch it', async () => {
    const me = await signIn(app, 'okafor');
    const ts = new Date(Date.now() - 60_000).toISOString();
    const saved = await me.post('/api/symptom-notes').send({ ts, summary: 'Red patch, left forearm', details: 'Itchy.', recheckHours: 4 });
    expect(saved.status).toBe(201);
    expect(saved.body).toMatchObject({ crewId: 'c1', summary: 'Red patch, left forearm', status: 'open', recheckAt: new Date(new Date(ts).getTime() + 4 * 3_600_000).toISOString() });
    expect((await me.get('/api/symptom-notes')).body.notes[0].id).toBe(saved.body.id);
    expect((await sx.get('/api/symptom-notes?crewId=c1')).body.notes.some((n) => n.id === saved.body.id)).toBe(true);
    const other = await signIn(app, 'marchetti');
    expect((await other.patch(`/api/symptom-notes/${saved.body.id}`).send({ status: 'done' })).status).toBe(403);
    expect((await other.get('/api/symptom-notes?crewId=c1')).status).toBe(403);
    const done = await me.patch(`/api/symptom-notes/${saved.body.id}`).send({ status: 'done' });
    expect(done.body.status).toBe('done');
  });
  it('rejects empty summaries and recheck times outside 1–48 hours', async () => {
    const me = await signIn(app, 'okafor');
    expect((await me.post('/api/symptom-notes').send({ summary: ' ' })).status).toBe(400);
    expect((await me.post('/api/symptom-notes').send({ summary: 'x', recheckHours: 0 })).status).toBe(400);
    expect((await me.post('/api/symptom-notes').send({ summary: 'x', recheckHours: 49 })).status).toBe(400);
    expect((await me.patch('/api/symptom-notes/nope').send({ status: 'done' })).status).toBe(404);
  });
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
