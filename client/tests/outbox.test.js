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

describe('Offline outbox with IndexedDB (Dexie)', () => {
  beforeEach(async () => {
    await db.logs.clear();
    await db.reports.clear();
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

  it('saves and retrieves pending escalation reports', async () => {
    const report = { id: 'rep-1', createdAt: '2026-11-15T12:05:00Z', priority: 'urgent', payload: { focus: 'temp' } };
    await saveOutboxReport(report);

    const pending = await getPendingReports();
    expect(pending).toHaveLength(1);
    expect(pending[0].id).toBe('rep-1');
    expect(pending[0].priority).toBe('urgent');

    await markOutboxReportSynced('rep-1');
    const remaining = await getPendingReports();
    expect(remaining).toHaveLength(0);
  });

  it('flushes pending logs and reports when online', async () => {
    await saveOutboxLog({ id: 'log-10', crewId: 'c1', ts: '2026-11-15T12:10:00Z', temp: 37.1 });
    await saveOutboxReport({ id: 'rep-20', createdAt: '2026-11-15T12:11:00Z', priority: 'nominal' });

    const postedReadings = [];
    const postedEscalations = [];
    const mockApi = {
      postReading: async (body) => { postedReadings.push(body); return { ok: true }; },
      postEscalation: async (body) => { postedEscalations.push(body); return { ok: true }; },
    };

    const res = await flushOutbox(mockApi);
    expect(res.logs).toBe(1);
    expect(res.reports).toBe(1);
    expect(postedReadings[0].id).toBe('log-10');
    expect(postedEscalations[0].id).toBe('rep-20');

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
