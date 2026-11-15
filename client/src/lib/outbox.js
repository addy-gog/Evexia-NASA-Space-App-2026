/**
 * Outbox: things that must reach the onboard server, kept in IndexedDB (the browser's built-in
 * database) until the server confirms them. Survives reloads, crashes and lost connections.
 *
 * Every item carries its own unique id, and the server ignores an id it has already stored,
 * so sending the same item twice (a retry after a lost reply, a double tap) never duplicates it.
 */
import Dexie from 'dexie';

export const db = new Dexie('evexia_outbox');

db.version(1).stores({
  logs: 'id, crewId, ts, synced',
  reports: 'id, createdAt, priority, synced',
});
// v2: reports are keyed by their own clientId. Reports have no `id` until the server gives them
// one, so v1 could never store them; that table is dropped (it could not hold any rows).
db.version(2).stores({
  reports: null,
  outboxReports: 'clientId, createdAt, priority, synced',
});

const available = () => typeof indexedDB !== 'undefined';

/**
 * Ask the browser to keep this site's storage instead of clearing it when space runs low.
 * Browsers may say no (Safari clears site data after 7 days without a visit regardless);
 * on a real mission the onboard server is the record of truth and this only bridges gaps.
 */
export async function requestPersistence() {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    return Boolean(await navigator.storage?.persist?.());
  } catch {
    return false;
  }
}

/** Save a log entry to the outbox. Returns true if it is safely stored. */
export async function saveOutboxLog(entry) {
  if (!available()) return false;
  try {
    await db.logs.put({ ...entry, synced: 0 });
    return true;
  } catch (err) {
    console.warn('[outbox] failed to save log:', err);
    return false;
  }
}

/** Remove a log entry once the server has confirmed it. */
export async function markOutboxLogSynced(id) {
  if (!available()) return;
  try {
    await db.logs.delete(id);
  } catch (err) {
    console.warn('[outbox] failed to delete synced log:', err);
  }
}

/** Log entries still waiting for the server. */
export async function getPendingLogs(crewId) {
  if (!available()) return [];
  try {
    const list = await db.logs.where('synced').equals(0).toArray();
    return crewId ? list.filter((l) => l.crewId === crewId) : list;
  } catch {
    return [];
  }
}

/** Save a flight-surgeon report to the outbox. It must carry a `clientId`. Returns true if stored. */
export async function saveOutboxReport(report) {
  if (!available() || !report?.clientId) return false;
  try {
    await db.outboxReports.put({ ...report, synced: 0 });
    return true;
  } catch (err) {
    console.warn('[outbox] failed to save report:', err);
    return false;
  }
}

/** Remove a report once the server has confirmed it. */
export async function markOutboxReportSynced(clientId) {
  if (!available()) return;
  try {
    await db.outboxReports.delete(clientId);
  } catch (err) {
    console.warn('[outbox] failed to delete synced report:', err);
  }
}

/** Reports still waiting for the server, emergencies first, then oldest first. */
export async function getPendingReports() {
  if (!available()) return [];
  try {
    const list = await db.outboxReports.where('synced').equals(0).toArray();
    return list.sort((a, b) => (a.priority === 'emergency' ? 0 : 1) - (b.priority === 'emergency' ? 0 : 1) || String(a.createdAt).localeCompare(String(b.createdAt)));
  } catch {
    return [];
  }
}

/**
 * Send everything waiting. Stops at the first network failure (still offline) and keeps the rest.
 * A 400 means the item can never be accepted, so it is dropped instead of retried forever.
 */
export async function flushOutbox(api) {
  if (!available() || !api) return { logs: 0, reports: 0 };
  let syncedLogs = 0;
  let syncedReports = 0;
  try {
    for (const log of await getPendingLogs()) {
      try {
        const { synced: _synced, pending: _pending, ...body } = log;
        await api.postReading(body);
        await markOutboxLogSynced(log.id);
        syncedLogs += 1;
      } catch (err) {
        if (err.status === 400) await markOutboxLogSynced(log.id);
        else break;
      }
    }
    for (const report of await getPendingReports()) {
      try {
        const { synced: _synced, ...body } = report;
        await api.postEscalation(body);
        await markOutboxReportSynced(report.clientId);
        syncedReports += 1;
      } catch (err) {
        if (err.status === 400) await markOutboxReportSynced(report.clientId);
        else break;
      }
    }
  } catch (err) {
    console.warn('[outbox] flush error:', err);
  }
  return { logs: syncedLogs, reports: syncedReports };
}
