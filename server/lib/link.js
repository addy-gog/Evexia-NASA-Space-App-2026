/**
 * Earth link: a store-and-forward simulation inspired by NASA's Delay/Disruption Tolerant
 * Networking (DTN). It is NOT the DTN protocol; it demonstrates the idea.
 *
 * - Reports to the flight surgeon wait on the spacecraft (this server) until the link is up.
 * - When the link is up they leave one at a time, emergencies first, and take the one-way
 *   light delay to reach Earth. The surgeon sees a report only once it has arrived.
 * - The crew learns a report arrived only when the receipt has come back (another one-way
 *   delay), so the app never claims Earth knows something before it could.
 * - The surgeon's reply, or a plain "read" receipt, travels back the same way.
 * - In a blackout nothing new leaves; anything already travelling keeps going.
 *
 * `timeScale` compresses the delay for demos: 1 = real time, 1/30 = a 12-minute delay takes
 * 24 s, 0 = instant (used by the automated tests).
 */

export const LINK_MODES = ['up', 'blackout'];
/** Real milliseconds between two messages leaving, so the priority order is visible. */
export const SEND_SPACING_MS = 2000;
export const DEFAULT_TIME_SCALE = 1 / 30;

const t = (iso) => (iso ? new Date(iso).getTime() : null);
const iso = (ms) => new Date(ms).toISOString();

/**
 * Send whatever is waiting, if the link is up. Pure scheduling: writes send / arrival times,
 * and statuses are derived from those times when read. Safe to call on every request.
 */
export function advanceLink(repo, now = Date.now()) {
  const link = repo.getLink();
  if (link.mode !== 'up') return;
  const scale = link.timeScale;
  const spacing = scale > 0 ? SEND_SPACING_MS : 0;
  let slot = 0;
  for (const e of repo.escalationsWaiting()) {
    const sent = now + slot * spacing;
    const oneWay = e.link.delaySeconds * 1000 * scale;
    repo.markEscalationSent(e.id, { sentAt: iso(sent), arriveAt: iso(sent + oneWay), receiptAt: iso(sent + 2 * oneWay) });
    slot += 1;
  }
  for (const e of repo.repliesWaiting()) {
    const sent = now + slot * spacing;
    repo.markReplySent(e.id, { sentAt: iso(sent), arriveAt: iso(sent + e.link.delaySeconds * 1000 * scale) });
    slot += 1;
  }
}

/** Has this report reached Earth? (The flight surgeon only ever sees these.) */
export function hasArrived(e, now = Date.now()) {
  return e.link.arriveAt != null && now >= t(e.link.arriveAt);
}

/**
 * The astronaut's honest view of one report: what the spacecraft can actually know right now.
 * Steps: waiting (link down) → saved (about to leave) → sending → sent (no receipt yet) →
 * arrived (receipt back) → read (surgeon's receipt back) → replied (reply back).
 */
export function crewView(e, linkMode, now = Date.now()) {
  const L = e.link;
  let step;
  if (!L.sentAt) step = linkMode === 'up' ? 'saved' : 'waiting';
  else if (now < t(L.sentAt)) step = 'sending';
  else if (now < t(L.receiptAt)) step = 'sent';
  else step = 'arrived';
  const back = L.back?.arriveAt && now >= t(L.back.arriveAt) ? L.back : null;
  if (back) step = back.kind === 'reply' ? 'replied' : 'read';
  const { back: _hidden, ...link } = L;
  return {
    ...e,
    note: '', // the surgeon's private note never travels to the crew
    link: {
      ...link,
      step,
      sentAt: L.sentAt && now >= t(L.sentAt) ? L.sentAt : null,
      confirmedAt: L.receiptAt && now >= t(L.receiptAt) ? L.arriveAt : null,
      reply: back ? { kind: back.kind, text: back.kind === 'reply' ? back.text : '', writtenAt: back.writtenAt, receivedAt: back.arriveAt } : null,
    },
  };
}

/** The flight surgeon's view: when it was written on board, when it reached Earth, and the reply's journey. */
export function surgeonView(e, now = Date.now()) {
  const b = e.link.back;
  let replyStep = null;
  if (b?.writtenAt) replyStep = !b.sentAt ? 'waiting' : now < t(b.arriveAt) ? 'travelling' : 'delivered';
  return {
    ...e,
    link: {
      writtenAt: e.payload.createdAt ?? e.createdAt,
      arrivedAt: e.link.arriveAt,
      delaySeconds: e.link.delaySeconds,
      back: b?.writtenAt ? { ...b, step: replyStep } : null,
    },
  };
}
