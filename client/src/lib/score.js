/**
 * Overall health score (0–100). Pure and unit tested.
 * Per-indicator points: green 100, amber 60, red 20. Weighted average using
 * the weights in thresholds.js. If any indicator is red the score is capped
 * at 59. Bands: 85–100 Nominal, 60–84 Watch, < 60 Action needed.
 */
import { INDICATORS, SCORE } from '../config/thresholds.js';

export function scoreBand(score) {
  return SCORE.bands.find((b) => score >= b.min) ?? SCORE.bands[SCORE.bands.length - 1];
}

/**
 * @param {object} results  { [indicatorId]: { severity } }; missing ids are skipped
 * @returns {{ score: number|null, band: object|null, capped: boolean, counted: number }}
 */
export function computeScore(results) {
  let weighted = 0;
  let totalWeight = 0;
  let anyRed = false;
  let counted = 0;
  for (const { id, weight } of INDICATORS) {
    const sev = results?.[id]?.severity;
    if (!sev) continue;
    counted += 1;
    weighted += SCORE.points[sev] * weight;
    totalWeight += weight;
    if (sev === 'red') anyRed = true;
  }
  if (totalWeight === 0) return { score: null, band: null, capped: false, counted: 0 };
  let score = Math.round(weighted / totalWeight);
  let capped = false;
  if (anyRed && score > SCORE.redCap) {
    score = SCORE.redCap;
    capped = true;
  }
  return { score, band: scoreBand(score), capped, counted };
}
