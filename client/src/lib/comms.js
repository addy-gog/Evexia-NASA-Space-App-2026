/**
 * Comms-delay autonomy logic. Long delay → self-care protocol first and
 * escalation marked as a delayed message. Short delay → escalate earlier
 * (amber findings are already recommended for escalation).
 */
import { SELF_CARE_DELAY_SECONDS, ENVIRONMENTS } from '../config/thresholds.js';

export function formatDelay(seconds) {
  if (!seconds || seconds < 0.05) return 'real-time';
  if (seconds < 60) return `${Number(seconds.toFixed(1))} s`;
  const min = seconds / 60;
  return `${Number(min.toFixed(min < 10 ? 1 : 0))} min`;
}

export function selfCareFirst(delaySeconds) {
  return delaySeconds > SELF_CARE_DELAY_SECONDS;
}

/**
 * @returns {{ selfCareFirst, recommendEscalation, autonomy, note, arrivalText }}
 */
export function commsPolicy(severity, delaySeconds, environmentId) {
  const env = ENVIRONMENTS[environmentId];
  const scFirst = selfCareFirst(delaySeconds);
  // Short delay: escalate on amber or red. Long delay: escalate red; amber is self-managed first.
  const recommendEscalation = severity === 'red' || (severity === 'amber' && !scFirst);
  let arrivalText;
  if (scFirst) {
    arrivalText = `Message will arrive in ${formatDelay(delaySeconds)}; a reply takes at least ${formatDelay(delaySeconds * 2)} round-trip.`;
  } else if (delaySeconds >= 1) {
    arrivalText = `Earth link ${formatDelay(delaySeconds)} one-way: near real-time.`;
  } else {
    arrivalText = 'Earth link is real-time.';
  }
  return {
    selfCareFirst: scFirst,
    recommendEscalation,
    autonomy: env?.autonomy ?? 'Low',
    note: env?.autonomyNote ?? '',
    arrivalText,
  };
}
