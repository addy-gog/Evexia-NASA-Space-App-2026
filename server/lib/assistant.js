/**
 * Claude-backed assistant with a rule-based offline fallback.
 * The API key never leaves the server. If no key is configured, the
 * upstream call fails, or the model declines, the rule-based engine answers
 * and the response is tagged `mode: "offline"`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ruleBasedAnswer } from '../../client/src/lib/ruleAssistant.js';
import { evaluateReading } from '../../client/src/lib/severity.js';
import { ENVIRONMENTS, INDICATORS } from '../../client/src/config/thresholds.js';
import { formatDelay, selfCareFirst } from '../../client/src/lib/comms.js';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
// Models that accept the server-side refusal fallback (`fallbacks: "default"`).
const FALLBACK_MODELS = new Set(['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-5-5']);

export const SYSTEM_PROMPT = `You are Evexia, an on-board health decision-support assistant for astronauts.
You explain the astronaut's health readings in simple, calm language that needs no medical background.

Rules you must always follow:
- Never diagnose a disease or condition. Describe what a reading may mean and what to do, and say it is decision support, not a diagnosis.
- Give practical self-care steps the astronaut can do with on-board resources.
- For ANY red reading, always tell the astronaut to escalate to the flight surgeon using the Escalate button, and to tell the crew medical officer.
- Respect the Earth communication delay given in the context. If the one-way delay is more than 5 minutes, put self-care steps FIRST and remind them not to wait for a reply from Earth before acting. If the delay is short, recommend escalating amber findings early as well.
- Link findings to the relevant spaceflight hazard (radiation, isolation and confinement, distance from Earth, gravity fields, hostile closed environments) when useful.
- If symptoms sound like an emergency (chest pain, fainting, confusion, trouble breathing), tell them to alert the crew immediately.
- Keep answers short: at most about 180 words, using short paragraphs or bullet points. Do not invent numbers or citations.`;

export function getAssistantConfig(env = process.env) {
  return {
    apiKey: env.ANTHROPIC_API_KEY || '',
    model: env.ANTHROPIC_MODEL || DEFAULT_MODEL,
    maxTokens: Math.min(Number(env.ASSISTANT_MAX_TOKENS) || 1500, 4000),
    timeoutMs: Number(env.ASSISTANT_TIMEOUT_MS) || 20000,
    baseURL: env.ANTHROPIC_BASE_URL || undefined,
  };
}

/** Sanitise the client-supplied context into a compact, bounded object. */
export function normaliseContext(raw = {}) {
  const environment = ENVIRONMENTS[raw.environment] ? raw.environment : 'station';
  const delaySeconds = Number.isFinite(Number(raw.delaySeconds)) ? Math.max(0, Math.min(3600, Number(raw.delaySeconds))) : 0;
  const reading = {};
  for (const f of ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep', 'radiation']) {
    const v = Number(raw.reading?.[f]);
    if (Number.isFinite(v)) reading[f] = v;
  }
  reading.spe = Boolean(raw.reading?.spe);
  const sleepHistory = Array.isArray(raw.sleepHistory) ? raw.sleepHistory.map(Number).filter(Number.isFinite).slice(-3) : [];
  let baseline = null;
  if (raw.baselineMode && raw.baseline && typeof raw.baseline === 'object') {
    baseline = {};
    for (const f of ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep']) {
      const v = Number(raw.baseline[f]);
      if (Number.isFinite(v) && v > 0) baseline[f] = v;
    }
  }
  // Severities are recomputed server-side so the prompt never trusts client labels.
  const results = evaluateReading(reading, { environment, sleepHistory, baselineMode: Boolean(baseline), baseline });
  return { environment, delaySeconds, reading, results, missionDay: Number(raw.missionDay) || null };
}

function contextText(ctx) {
  const env = ENVIRONMENTS[ctx.environment];
  const lines = [
    `Environment: ${env.label}. Autonomy level: ${env.autonomy}.`,
    `Earth link one-way delay: ${formatDelay(ctx.delaySeconds)}${selfCareFirst(ctx.delaySeconds) ? ' (long delay: self-care first)' : ''}.`,
  ];
  if (ctx.missionDay) lines.push(`Mission day: ${ctx.missionDay}.`);
  lines.push('Current readings and status:');
  for (const m of INDICATORS) {
    const r = ctx.results[m.id];
    if (r) lines.push(`- ${m.label}: ${r.value} ${m.unit}, ${r.severity.toUpperCase()}. ${r.reason}`);
  }
  return lines.join('\n');
}

function offline(question, ctx, reason) {
  return {
    mode: 'offline',
    reason,
    answer: ruleBasedAnswer(question, {
      results: ctx.results,
      delaySeconds: ctx.delaySeconds,
      environmentLabel: ENVIRONMENTS[ctx.environment].label,
    }),
  };
}

/**
 * @param {{question: string, context: object}} input
 * @param {object} config  from getAssistantConfig()
 * @param {object} [deps]  { client } for tests
 */
export async function answerQuestion({ question, context }, config, deps = {}) {
  const ctx = normaliseContext(context);
  if (!config.apiKey && !deps.client) return offline(question, ctx, 'no_api_key');

  const client =
    deps.client ??
    new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeoutMs, maxRetries: 1 });

  const params = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: SYSTEM_PROMPT,
    output_config: { effort: 'low' },
    messages: [
      {
        role: 'user',
        content: `<context>\n${contextText(ctx)}\n</context>\n\nAstronaut question: ${question}`,
      },
    ],
  };

  try {
    const useFallbacks = FALLBACK_MODELS.has(config.model);
    const response = useFallbacks
      ? await client.beta.messages.create({ ...params, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
      : await client.messages.create(params);

    if (response.stop_reason === 'refusal') return offline(question, ctx, 'refusal');
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return offline(question, ctx, 'empty_response');
    return { mode: 'ai', model: response.model ?? config.model, answer: text, truncated: response.stop_reason === 'max_tokens' };
  } catch (err) {
    let reason = 'upstream_error';
    if (err instanceof Anthropic.AuthenticationError) reason = 'auth_error';
    else if (err instanceof Anthropic.RateLimitError) reason = 'rate_limited';
    else if (err instanceof Anthropic.APIConnectionTimeoutError) reason = 'timeout';
    else if (err instanceof Anthropic.APIConnectionError) reason = 'unreachable';
    else if (err instanceof Anthropic.APIError) reason = `api_error_${err.status ?? 'unknown'}`;
    console.warn(`[assistant] falling back to offline guidance: ${reason}`);
    return offline(question, ctx, reason);
  }
}
