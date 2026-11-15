/**
 * The journey of a report to the flight surgeon, as the spacecraft can honestly know it.
 * Matches server/lib/link.js `crewView` steps: waiting | saved | sending | sent | arrived | read | replied.
 */
export const JOURNEY = [
  { id: 'saved', label: 'Saved on board' },
  { id: 'sent', label: 'Sent' },
  { id: 'arrived', label: 'Arrived on Earth' },
  { id: 'read', label: 'Read by the surgeon' },
  { id: 'replied', label: 'Reply received' },
];

const REACHED = { waiting: 0, saved: 0, sending: 0, sent: 1, arrived: 2, read: 3, replied: 4 };

/** Index of the last journey step reached (0..4). */
export function reachedIndex(step) {
  return REACHED[step] ?? 0;
}

/** One plain sentence for where a report is now. */
export function stepSentence(step, delayText) {
  switch (step) {
    case 'waiting':
      return 'Waiting on board. The Earth link is down, so it leaves when the link is back.';
    case 'saved':
    case 'sending':
      return 'Leaving now. Messages go one at a time, emergencies first.';
    case 'sent':
      return `On its way. It takes about ${delayText} to reach Earth, and the receipt takes as long again to come back.`;
    case 'arrived':
      return 'Arrived on Earth. The flight surgeon has it.';
    case 'read':
      return 'The flight surgeon has read it.';
    case 'replied':
      return 'The flight surgeon replied.';
    default:
      return '';
  }
}
