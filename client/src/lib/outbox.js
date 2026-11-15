import Dexie from 'dexie';

export const db = new Dexie('evexia_outbox');

db.version(1).stores({
  logs: 'id, crewId, ts, synced',
  reports: 'id, createdAt, priority, synced',
});

/** Save a log entry to the offline outbox */
export async function saveOutboxLog(entry) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await db.logs.put({ ...entry, synced: 0 });
  } catch (err) {
    console.warn('[outbox] failed to save log:', err);
  }
}

/** Mark a log entry as synced or remove it */
export async function markOutboxLogSynced(id) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await db.logs.delete(id);
  } catch (err) {
    console.warn('[outbox] failed to delete synced log:', err);
  }
}

/** Get all pending (unsynced) log entries */
export async function getPendingLogs(crewId) {
  if (typeof indexedDB === 'undefined') return [];
  try {
    const list = await db.logs.where('synced').equals(0).toArray();
    return crewId ? list.filter((l) => l.crewId === crewId) : list;
  } catch {
    return [];
  }
}

/** Save an escalation report to the offline outbox */
export async function saveOutboxReport(report) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await db.reports.put({ ...report, synced: 0 });
  } catch (err) {
    console.warn('[outbox] failed to save report:', err);
  }
}

/** Mark a report as synced or remove it */
export async function markOutboxReportSynced(id) {
  if (typeof indexedDB === 'undefined') return;
  try {
    await db.reports.delete(id);
  } catch (err) {
    console.warn('[outbox] failed to delete synced report:', err);
  }
}

/** Get all pending (unsynced) reports */
export async function getPendingReports() {
  if (typeof indexedDB === 'undefined') return [];
  try {
    return await db.reports.where('synced').equals(0).toArray();
  } catch {
    return [];
  }
}

/** Flush outbox: push all pending logs and reports to the server */
export async function flushOutbox(api) {
  if (typeof indexedDB === 'undefined' || !api) return { logs: 0, reports: 0 };
  let syncedLogs = 0;
  let syncedReports = 0;

  try {
    const pendingLogs = await getPendingLogs();
    for (const log of pendingLogs) {
      try {
        const { synced, pending, ...body } = log;
        await api.postReading(body);
        await markOutboxLogSynced(log.id);
        syncedLogs++;
      } catch (err) {
        if (err.status === 400) {
          // Permanently invalid, discard from outbox
          await markOutboxLogSynced(log.id);
        } else {
          // Network still down or server error: stop trying for now
          break;
        }
      }
    }

    const pendingReports = await getPendingReports();
    for (const report of pendingReports) {
      try {
        const { synced, ...body } = report;
        await api.postEscalation(body);
        await markOutboxReportSynced(report.id);
        syncedReports++;
      } catch (err) {
        if (err.status === 400) {
          await markOutboxReportSynced(report.id);
        } else {
          break;
        }
      }
    }
  } catch (err) {
    console.warn('[outbox] flush error:', err);
  }

  return { logs: syncedLogs, reports: syncedReports };
}
