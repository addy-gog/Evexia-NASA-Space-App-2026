import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  saveOutboxLog,
  getPendingLogs,
  markOutboxLogSynced,
  saveOutboxReport,
  getPendingReports,
  markOutboxReportSynced,
  flushOutbox,
} from '../src/lib/outbox.js';
import { buildEscalationReport, validateEscalationPayload } from '../src/lib/escalation.js';
import { evaluateCurrent } from '../src/lib/evaluate.js';

/** A report exactly as the app builds it (no `id` until the server assigns one). */
function realReport(priority = 'routine', clientId = `client-${priority}-${Math.random()}`) {
  const status = evaluateCurrent([{ id: 'x', crewId: 'c1', ts: new Date().toISOString(), glucose: 130, environment: 'marsTransit', source: 'manual' }], { environment: 'marsTransit' });
  return { ...buildEscalationReport({ crew: { id: 'c1', name: 'Cdr. Ada Okafor', role: 'Commander' }, status, environment: 'marsTransit', delaySeconds: 720, priority }), clientId };
}

describe('Offline outbox with IndexedDB (Dexie)', () => {
  beforeEach(async () => {
    await db.logs.clear();
    await db.outboxReports.clear();
  });

  it('saves and retrieves pending log entries', async () => {
    const entry = { id: 'log-1', crewId: 'c1', ts: '2026-11-15T12:00:00Z', hr: 72, source: 'manual' };
    await saveOutboxLog(entry);

    const pending = await getPendingLogs('c1');
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('log-1');
    expect(pending[0].hr).toBe(72);
    expect(pending[0].synced).toBe(0);

    // Filtering by different crewId returns empty
    const other = await getPendingLogs('c2');
    expect(other).toHaveLength(0);

    // Mark synced removes from outbox
    await markOutboxLogSynced('log-1');
    const remaining = await getPendingLogs('c1');
    expect(remaining).toHaveLength(0);
  });

  it('keeps a real report from the app (which has no id) under its clientId', async () => {
    const report = realReport('emergency', 'client-1');
    expect(report.id).toBeUndefined();
    expect(validateEscalationPayload(report)).toEqual([]);
    expect(await saveOutboxReport(report)).toBe(true);

    const pending = await getPendingReports();
    expect(pending).toHaveLength(1);
    expect(pending[0].clientId).toBe('client-1');
    expect(pending[0].priority).toBe('emergency');
    expect(pending[0].readings.glucose.value).toBe(130);

    await markOutboxReportSynced('client-1');
    expect(await getPendingReports()).toHaveLength(0);
  });

  it('refuses a report with no clientId instead of pretending it was kept', async () => {
    const { clientId: _c, ...noId } = realReport();
    expect(await saveOutboxReport(noId)).toBe(false);
    expect(await getPendingReports()).toHaveLength(0);
  });

  it('saving the same report twice keeps one copy', async () => {
    const report = realReport('routine', 'client-dup');
    await saveOutboxReport(report);
    await saveOutboxReport(report);
    expect(await getPendingReports()).toHaveLength(1);
  });

  it('flushes pending logs and reports when online', async () => {
    await saveOutboxLog({ id: 'log-10', crewId: 'c1', ts: '2026-11-15T12:10:00Z', temp: 37.1 });
    await saveOutboxReport(realReport('routine', 'rep-routine'));
    await saveOutboxReport(realReport('emergency', 'rep-emergency'));

    const postedReadings = [];
    const postedEscalations = [];
    const mockApi = {
      postReading: async (body) => { postedReadings.push(body); return { ok: true }; },
      postEscalation: async (body) => { postedEscalations.push(body); return { ok: true }; },
    };

    const res = await flushOutbox(mockApi);
    expect(res.logs).toBe(1);
    expect(res.reports).toBe(2);
    expect(postedReadings[0].id).toBe('log-10');
    // Emergencies go first; the outbox bookkeeping field is not sent.
    expect(postedEscalations.map((r) => r.clientId)).toEqual(['rep-emergency', 'rep-routine']);
    expect(postedEscalations[0].synced).toBeUndefined();

    // Both tables should now be drained/empty
    expect(await getPendingLogs()).toHaveLength(0);
    expect(await getPendingReports()).toHaveLength(0);
  });

  it('stops flushing when network error occurs without dropping unsynced records', async () => {
    await saveOutboxLog({ id: 'log-a', crewId: 'c1', ts: '2026-11-15T12:20:00Z' });
    await saveOutboxLog({ id: 'log-b', crewId: 'c1', ts: '2026-11-15T12:21:00Z' });

    let callCount = 0;
    const failingApi = {
      postReading: async () => {
        callCount++;
        const err = new Error('Network failure');
        err.status = 503;
        throw err;
      },
    };

    const res = await flushOutbox(failingApi);
    expect(res.logs).toBe(0);
    expect(callCount).toBe(1);

    // Records stay in the outbox
    const stillPending = await getPendingLogs();
    expect(stillPending).toHaveLength(2);
  });
});
