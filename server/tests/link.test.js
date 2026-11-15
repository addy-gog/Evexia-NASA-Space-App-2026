import { describe, it, expect, beforeEach } from 'vitest';
import { openDb } from '../db/index.js';
import { createRepo } from '../db/repo.js';
import { advanceLink, crewView, hasArrived, surgeonView, SEND_SPACING_MS } from '../lib/link.js';

// A 12-minute one-way delay at demo speed 1/30 is 24 s; times below are on a fake clock.
const T0 = Date.parse('2026-11-15T12:00:00Z');
const ONE_WAY = 720 * 1000 * (1 / 30); // 24 000 ms
const at = (ms) => T0 + ms;

let repo;
const report = (priority = 'routine', crew = 'c1') =>
  repo.insertEscalation({ crew: { id: crew, name: 'Test', role: 'Test' }, priority, createdAt: new Date(T0).toISOString(), delay: { seconds: 720 }, environment: { id: 'marsTransit', label: 'Mars transit' }, readings: {}, severities: {} });
const get = (id) => repo.getEscalation(id);

beforeEach(() => {
  repo = createRepo(openDb(':memory:').db);
  repo.getLink({ mode: 'up', timeScale: 1 / 30 });
});

describe('Earth link (store and forward)', () => {
  it('in a blackout a report waits on board; nothing reaches Earth', () => {
    repo.setLink({ mode: 'blackout' });
    const e = report('emergency');
    advanceLink(repo, at(0));
    expect(get(e.id).link.sentAt).toBeNull();
    expect(crewView(get(e.id), 'blackout', at(60_000)).link.step).toBe('waiting');
    expect(hasArrived(get(e.id), at(10 * 60_000))).toBe(false);
  });

  it('when the link comes up it leaves, arrives after the one-way delay, and the crew only knows after the receipt returns', () => {
    repo.setLink({ mode: 'blackout' });
    const e = report();
    repo.setLink({ mode: 'up' });
    advanceLink(repo, at(0));
    const r = get(e.id);
    expect(crewView(r, 'up', at(1000)).link.step).toBe('sent');
    expect(hasArrived(r, at(ONE_WAY - 1))).toBe(false);
    expect(hasArrived(r, at(ONE_WAY))).toBe(true);
    // Earth has it, but the spacecraft cannot know until the receipt travels back.
    expect(crewView(r, 'up', at(ONE_WAY + 1000)).link.step).toBe('sent');
    expect(crewView(r, 'up', at(ONE_WAY + 1000)).link.confirmedAt).toBeNull();
    const confirmed = crewView(r, 'up', at(2 * ONE_WAY));
    expect(confirmed.link.step).toBe('arrived');
    expect(confirmed.link.confirmedAt).toBe(r.link.arriveAt);
  });

  it('emergencies leave first, then the rest in order, one at a time', () => {
    repo.setLink({ mode: 'blackout' });
    const a = report('routine');
    const b = report('routine');
    const c = report('emergency');
    repo.setLink({ mode: 'up' });
    advanceLink(repo, at(0));
    const sent = (x) => Date.parse(get(x.id).link.sentAt);
    expect(sent(c)).toBe(at(0));
    expect(sent(a)).toBe(at(SEND_SPACING_MS));
    expect(sent(b)).toBe(at(2 * SEND_SPACING_MS));
  });

  it('a reply travels back with the same delay; the crew sees it only on arrival; the private note never travels', () => {
    const e = report();
    advanceLink(repo, at(0));
    repo.updateEscalation(e.id, { status: 'reviewed', note: 'private ground note' });
    repo.setReply(e.id, { kind: 'reply', text: 'Rest and recheck in 2 h.', writtenAt: new Date(at(ONE_WAY)).toISOString() });
    advanceLink(repo, at(ONE_WAY));
    const r = get(e.id);
    expect(surgeonView(r, at(ONE_WAY + 1000)).link.back.step).toBe('travelling');
    expect(crewView(r, 'up', at(2 * ONE_WAY - 1)).link.reply).toBeNull();
    const got = crewView(r, 'up', at(2 * ONE_WAY));
    expect(got.link.step).toBe('replied');
    expect(got.link.reply.text).toBe('Rest and recheck in 2 h.');
    expect(got.note).toBe('');
    expect(JSON.stringify(got)).not.toContain('private ground note');
  });

  it('a plain "reviewed" sends a read receipt with no text', () => {
    const e = report();
    advanceLink(repo, at(0));
    repo.setReply(e.id, { kind: 'ack', writtenAt: new Date(at(ONE_WAY)).toISOString() });
    advanceLink(repo, at(ONE_WAY));
    const v = crewView(get(e.id), 'up', at(2 * ONE_WAY));
    expect(v.link.step).toBe('read');
    expect(v.link.reply).toMatchObject({ kind: 'ack', text: '' });
  });

  it('a blackout does not stop a message that is already travelling', () => {
    const e = report();
    advanceLink(repo, at(0));
    repo.setLink({ mode: 'blackout' });
    expect(hasArrived(get(e.id), at(ONE_WAY))).toBe(true);
  });

  it('instant mode (tests) delivers straight away', () => {
    repo.setLink({ timeScale: 0 });
    const e = report();
    advanceLink(repo, at(0));
    expect(hasArrived(get(e.id), at(0))).toBe(true);
    expect(crewView(get(e.id), 'up', at(0)).link.step).toBe('arrived');
  });
});
