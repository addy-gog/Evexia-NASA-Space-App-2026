/**
 * Hazard correlation engine. Simple, transparent rules that combine
 * readings into insights linked to the five NASA HRP hazards of human
 * spaceflight: radiation, isolation & confinement, distance from Earth,
 * gravity fields, hostile/closed environments.
 */
import { selfCareFirst, formatDelay } from './comms.js';
import { HAZARDS } from '../content/hazards.js';

const bad = (r) => Boolean(r) && (r.severity === 'amber' || r.severity === 'red');
const isRed = (r) => Boolean(r) && r.severity === 'red';

export const ISOLATION_CONTACT_DAYS = 14;

/**
 * @param {object} results   output of evaluateReading
 * @param {object} ctx       { daysSinceContact, delaySeconds, cumulative }
 * @returns {Array<{ id, hazard, severity, title, detail, triggers, sources }>}
 */
export function correlateHazards(results = {}, ctx = {}) {
  const { daysSinceContact = 0, delaySeconds = 0, cumulative = null } = ctx;
  const out = [];
  const push = (id, hazard, severity, title, detail, triggers) =>
    out.push({ id, hazard, severity, title, detail, triggers, sources: HAZARDS[hazard].sources });

  // 1. Isolation and confinement: behavioural health risk.
  if (bad(results.sleep) && bad(results.hr) && daysSinceContact >= ISOLATION_CONTACT_DAYS) {
    push(
      'behavioural-health',
      'isolation',
      isRed(results.sleep) || isRed(results.hr) ? 'red' : 'amber',
      'Isolation and confinement: behavioural health risk',
      `Short sleep plus raised heart rate after ${daysSinceContact} days without a private crew or family conference. Schedule a conference, protect the sleep period and talk to your crew medical officer.`,
      ['sleep', 'hr', 'daysSinceContact'],
    );
  }

  // 2. Stress pattern (heart rate + blood pressure).
  if (bad(results.hr) && bad(results.bp)) {
    push(
      'stress-load',
      'isolation',
      isRed(results.hr) || isRed(results.bp) ? 'red' : 'amber',
      'Isolation and confinement: stress load',
      'Heart rate and blood pressure are both up. Workload, conflict or confinement stress are common causes. Review the schedule and use a relaxation countermeasure.',
      ['hr', 'bp'],
    );
  }

  // 3. Space radiation.
  if (bad(results.radiation)) {
    const spe = Boolean(results.radiation.spe);
    push(
      'radiation-dose',
      'radiation',
      results.radiation.severity,
      spe
        ? 'Space radiation: solar particle event, go to the storm shelter'
        : 'Space radiation: review shielding and time in the storm shelter',
      spe
        ? 'A solar particle event is under way. Move to the shielded shelter and stay until the all-clear. Log your dosimeter reading.'
        : 'Dose rate is above the green limit for this environment. Spend sleep periods in the most shielded area and check your dosimeter.',
      ['radiation'],
    );
  }
  if (bad(cumulative)) {
    push(
      'cumulative-dose',
      'radiation',
      cumulative.severity,
      'Space radiation: cumulative dose is high',
      `${cumulative.pct.toFixed(0)}% of the career limit used. Plan to minimise further exposure (EVA timing, shielding).`,
      ['cumulative'],
    );
  }

  // 4. Gravity fields: fluid shift / cardiovascular.
  if (bad(results.bp)) {
    push(
      'fluid-shift',
      'gravity',
      results.bp.severity,
      'Gravity fields: fluid shift and cardiovascular load',
      'In weightlessness fluid moves toward the head and the heart and vessels adapt. Abnormal blood pressure can signal this. Keep up exercise and fluid and salt protocols.',
      ['bp'],
    );
  }

  // 5. Hostile closed environment: low blood oxygen (cabin air), fever, or glucose + sleep (metabolic stress).
  if (bad(results.spo2)) {
    const withFever = bad(results.temp) && results.temp.value > 37;
    push(
      'cabin-air',
      'hostileEnvironment',
      results.spo2.severity,
      withFever ? 'Hostile closed environment: low oxygen with a fever' : 'Hostile closed environment: low blood oxygen, check the cabin air',
      withFever
        ? 'Low blood oxygen with a raised temperature can mean a chest infection. Breathing comes first: sit upright, tell your crew medical officer and keep re-measuring.'
        : 'Low blood oxygen in a sealed cabin can come from the air system (low oxygen or high carbon dioxide). Check the cabin air readings with your crew, then re-measure.',
      withFever ? ['spo2', 'temp'] : ['spo2'],
    );
  }
  if (bad(results.temp) && results.temp.value > 37) {
    push(
      'infection-risk',
      'hostileEnvironment',
      results.temp.severity,
      'Hostile closed environment: possible infection',
      'Raised temperature in a closed cabin can mean infection (microbes thrive and immunity changes in flight). Isolate personal items, check cabin air and humidity, tell your crew.',
      ['temp'],
    );
  }
  if (bad(results.glucose) && bad(results.sleep)) {
    push(
      'metabolic-stress',
      'hostileEnvironment',
      isRed(results.glucose) ? 'red' : 'amber',
      'Hostile closed environment: metabolic stress',
      'Raised glucose together with poor sleep suggests metabolic stress (diet, inactivity, CO2 and disrupted light cycles). Review meals, exercise and lighting.',
      ['glucose', 'sleep'],
    );
  }

  // 6. Distance from Earth: any red with a long comms delay.
  const anyRed = Object.values(results).some(isRed);
  if (anyRed && selfCareFirst(delaySeconds)) {
    push(
      'distance-autonomy',
      'distance',
      'red',
      'Distance from Earth: self-care protocol active',
      `Help from Earth is ${formatDelay(delaySeconds)} away one-way. Follow the self-care protocol now and send the escalation report; do not wait for a reply before acting.`,
      ['delay'],
    );
  }

  return out;
}
