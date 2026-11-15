/**
 * Overall health score (0–100). Pure and unit tested.
 * Computed by lib/triage.js (IITT colour tiers + ABCDE weights, interaction penalties and
 * a ceiling set by the most urgent flag). Bands: 85–100 Mission ready, 60–84 Monitor closely,
 * under 60 Act now. Every red flag caps the score at 59 or less, every amber flag at 84 or less.
 */
import { SCORE } from '../config/thresholds.js';
import { computeHealth, capReason } from './triage.js';

export function scoreBand(score) {
  return SCORE.bands.find((b) => score >= b.min) ?? SCORE.bands[SCORE.bands.length - 1];
}

/**
 * @param {object} results  { [indicatorId]: classifier result }; missing ids are skipped
 * @returns {{ score: number|null, band: object|null, capped: boolean, counted: number,
 *             cap: number|null, capReason: string|null, raw: number|null, penalty: number, parts: object, triage: object }}
 */
export function computeScore(results) {
  const h = computeHealth(results);
  if (h.score == null) return { ...h, band: null, capReason: null };
  return { ...h, band: scoreBand(h.score), capReason: capReason(h) };
}
