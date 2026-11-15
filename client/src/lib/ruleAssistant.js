/**
 * Rule-based assistant: the offline fallback used when the Claude API is
 * unavailable, no key is configured, or the crew member switches to offline.
 * Deterministic, never diagnoses, always recommends escalation for critical
 * findings, respects the comms delay.
 */
import { GUIDANCE, GREEN_MESSAGE } from '../content/guidance.js';
import { HAZARDS } from '../content/hazards.js';
import { INDICATORS } from '../config/thresholds.js';
import { selfCareFirst, formatDelay } from './comms.js';
import { SEVERITY_RANK } from './severity.js';

const WORD = { green: 'NOMINAL', amber: 'CAUTION', red: 'CRITICAL' };

const KEYWORDS = {
  hr: ['heart', 'pulse', 'bpm', 'hr'],
  bp: ['blood pressure', 'pressure', 'bp', 'systolic', 'diastolic'],
  glucose: ['glucose', 'sugar', 'blood sugar', 'insulin'],
  temp: ['temperature', 'temp', 'fever', 'cold', 'hot'],
  sleep: ['sleep', 'tired', 'fatigue', 'insomnia', 'nap'],
  radiation: ['radiation', 'dose', 'solar', 'dosimeter', 'mSv', 'mGy', 'storm'],
};

export function detectIndicators(question = '') {
  const q = question.toLowerCase();
  return Object.entries(KEYWORDS)
    .filter(([, words]) => words.some((w) => new RegExp(`\\b${w.toLowerCase()}\\b`).test(q)))
    .map(([id]) => id);
}

const flagged = (results) =>
  INDICATORS.filter((m) => results[m.id] && results[m.id].severity !== 'green').sort(
    (a, b) => SEVERITY_RANK[results[b.id].severity] - SEVERITY_RANK[results[a.id].severity] || b.weight - a.weight,
  );

/** First assistant message, generated from the current state. */
export function summaryMessage(ctx = {}) {
  const { results = {}, score = null, tier = '' } = ctx;
  const f = flagged(results);
  const head = score != null ? `Score ${score} · ${tier}. ` : '';
  if (!Object.keys(results).length) return 'No current readings yet. Log your morning readings or sync a wearable, and I will explain them.';
  if (!f.length) return `${head}All current readings are nominal. Keep your routine.`;
  const first = f[0];
  const g = GUIDANCE[first.id][results[first.id].severity];
  return `${head}${f.map((m) => `${m.short} (${WORD[results[m.id].severity].toLowerCase()})`).join(', ')} ${f.length > 1 ? 'need' : 'needs'} attention. Start with ${first.short.toLowerCase()}: ${g.selfCare[0]}`;
}

/**
 * @param {string} question
 * @param {object} ctx { results, delaySeconds, environmentLabel, score, tier, missionDay, crewName }
 */
export function ruleBasedAnswer(question, ctx = {}) {
  const { results = {}, delaySeconds = 0, environmentLabel = 'your environment', score = null, tier = '', missionDay = null, crewName = '' } = ctx;
  const q = question.toLowerCase();
  const longDelay = selfCareFirst(delaySeconds);
  let ids = detectIndicators(question);

  // Intents from the suggestion chips.
  if (!ids.length && /\b(delay|earth|link|ground)\b/.test(q)) {
    return longDelay
      ? `Messages take about ${formatDelay(delaySeconds)} each way in ${environmentLabel}, so a reply takes at least ${formatDelay(delaySeconds * 2)}. That is why Evexia is in Autonomy mode: start the self-care steps first, re-measure, then escalate if nothing improves. For anything critical, send the report straight away and keep following the steps.`
      : `The flight surgeon is reachable in near real time (${delaySeconds >= 1 ? `${formatDelay(delaySeconds)} one-way` : 'real-time link'}). Escalate early on any caution that does not settle and on every critical reading.`;
  }
  if (!ids.length && /\b(report|draft|surgeon)\b/.test(q)) {
    const f = flagged(results);
    const lines = [
      'Draft for the flight surgeon',
      `${crewName ? `${crewName} · ` : ''}${missionDay ? `Mission day ${missionDay} · ` : ''}${environmentLabel}`,
      score != null ? `Score ${score} (${tier})` : 'No score yet',
      ...(f.length ? f.map((m) => `• ${m.label}: ${results[m.id].value} ${m.unit} · ${WORD[results[m.id].severity]}`) : ['• No flags']),
      'Open Guidance → Escalate to send it with measurement times.',
    ];
    return lines.join('\n');
  }
  if (!ids.length && /\b(first|start|priority|what should i do|next)\b/.test(q)) {
    const f = flagged(results);
    if (!f.length) return 'Nothing urgent. All current readings are nominal; measure again at your scheduled time.';
    const m = f[0];
    const g = GUIDANCE[m.id][results[m.id].severity];
    return `Start with ${m.short.toLowerCase()} (${WORD[results[m.id].severity].toLowerCase()}). ${g.meaning}\n\n${(longDelay ? g.selfCare : g.actions).map((x) => `• ${x}`).join('\n')}${results[m.id].severity === 'red' ? '\n\nThis is critical: escalate to the flight surgeon now.' : ''}\n\nThis is decision support, not a diagnosis.`;
  }

  if (!ids.length) ids = flagged(results).map((m) => m.id);
  const parts = [];
  if (!ids.length) {
    parts.push('All your current readings are nominal. ' + GREEN_MESSAGE);
    parts.push('Ask me about a specific reading, the comms delay, or to draft a report.');
    return parts.join('\n\n');
  }

  let anyRed = false;
  for (const id of ids) {
    const meta = INDICATORS.find((m) => m.id === id);
    const r = results[id];
    const g = GUIDANCE[id];
    if (!r) {
      parts.push(`${meta.label}: no current reading. Use Log to add one.`);
      continue;
    }
    if (r.severity === 'green') {
      parts.push(`${meta.label} is NOMINAL (${r.reason}) ${GREEN_MESSAGE}`);
      continue;
    }
    if (r.severity === 'red') anyRed = true;
    const s = g[r.severity];
    const block = [`${meta.label} is ${WORD[r.severity]}. ${r.reason}`, s.meaning];
    block.push(`Why it matters in space (${HAZARDS[g.hazard].label}): ${g.why}`);
    const selfCare = `Self-care now:\n${s.selfCare.map((x) => `• ${x}`).join('\n')}`;
    const actions = `Next steps:\n${s.actions.map((x) => `• ${x}`).join('\n')}`;
    if (longDelay) block.push(selfCare, actions);
    else block.push(actions, selfCare);
    parts.push(block.join('\n'));
  }

  if (anyRed) {
    parts.push(
      longDelay
        ? `Critical finding: send the escalation report to the flight surgeon now. In ${environmentLabel} your message takes about ${formatDelay(delaySeconds)} to arrive, so follow the self-care steps without waiting for a reply.`
        : 'Critical finding: escalate to the flight surgeon now using the Escalate button.',
    );
  }
  parts.push('This is decision support, not a diagnosis. If you feel unwell, tell your crew medical officer.');
  return parts.join('\n\n');
}
