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
import { getKnowledgePack, getLabData, getRadiationReference, LAB_TESTS, RADIATION_REFERENCE } from './knowledge.js';

/** At most this many tool round trips per question, so a question can never loop or run up cost. */
const MAX_TOOL_ROUNDS = 3;
const HISTORY_FIELDS = ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep', 'radiation'];

/** Read-only tools Claude may call. Kept in a fixed order so the cached prompt prefix stays identical. */
export const TOOLS = [
  {
    name: 'get_radiation_reference',
    description:
      'Measured radiation (absorbed dose, mGy/day, from NASA RadLab) and published effective dose (mSv/day) for one mission environment, with the NASA radiation limits and a real solar-event example. Use when the astronaut asks whether their radiation is normal for where they are.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { environment: { type: 'string', enum: Object.keys(RADIATION_REFERENCE) } },
      required: ['environment'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_inspiration4_lab_data',
    description:
      'Real blood test values for the four SpaceX Inspiration4 crew (NASA OSDR OSD-575 and OSD-569), before and after their 3-day flight, with the lab normal range for each sample. Use to compare a reading with real astronaut data.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: { test: { type: 'string', enum: Object.keys(LAB_TESTS) } },
      required: ['test'],
      additionalProperties: false,
    },
  },
  {
    name: 'get_my_recent_readings',
    description:
      "This astronaut's own logged readings for the last few days, newest first, with time, values and notes. Use for questions about trends, such as whether sleep has been falling.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: { days: { type: 'integer', description: 'How many days back to look, 1 to 14.' } },
      required: ['days'],
      additionalProperties: false,
    },
  },
];

/** Run one tool call. Never throws: errors come back as text Claude can read. */
export function runTool(name, input, { crewId, repo } = {}) {
  try {
    if (name === 'get_radiation_reference') return getRadiationReference(String(input?.environment));
    if (name === 'get_inspiration4_lab_data') return getLabData(String(input?.test));
    if (name === 'get_my_recent_readings') {
      if (!crewId || !repo) return { error: 'No crew member is signed in, so personal readings are not available.' };
      const days = Math.max(1, Math.min(14, Math.round(Number(input?.days) || 7)));
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const rows = repo.readingsSince(crewId, since).slice(-40).reverse();
      return {
        days,
        count: rows.length,
        readings: rows.map((r) => {
          const out = { ts: r.ts };
          for (const f of HISTORY_FIELDS) if (r[f] != null) out[f] = r[f];
          if (r.environment) out.environment = r.environment;
          if (r.notes) out.notes = String(r.notes).slice(0, 200);
          return out;
        }),
        units: 'hr bpm; sys/dia mmHg; glucose mg/dL; temp °C; sleep hours; radiation mGy/day absorbed',
      };
    }
    return { error: `Unknown tool ${name}.` };
  } catch (err) {
    return { error: `Tool failed: ${err.message}` };
  }
}

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
- Base facts on the <evexia_knowledge> pack and on tool results, and name the source in brackets when you use one, for example [NASA-STD-3001] or [NASA OSDR]. If neither covers the question, say so.
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
 * The system prompt as two blocks: the rules, then the knowledge pack. The cache
 * breakpoint sits on the pack, so tools + rules + pack are cached together and
 * later questions re-read them at the cache price.
 */
export function systemBlocks() {
  return [
    { type: 'text', text: SYSTEM_PROMPT },
    { type: 'text', text: getKnowledgePack(), cache_control: { type: 'ephemeral' } },
  ];
}

/**
 * @param {{question: string, context: object, crewId?: string}} input
 * @param {object} config  from getAssistantConfig()
 * @param {object} [deps]  { client } for tests, { repo } for the readings tool
 */
export async function answerQuestion({ question, context, crewId }, config, deps = {}) {
  const ctx = normaliseContext(context);
  if (!config.apiKey && !deps.client) return offline(question, ctx, 'no_api_key');

  const client =
    deps.client ??
    new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeoutMs, maxRetries: 1 });

  const messages = [
    {
      role: 'user',
      content: `<context>\n${contextText(ctx)}\n</context>\n\nAstronaut question: ${question}`,
    },
  ];
  const base = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemBlocks(),
    tools: TOOLS,
    output_config: { effort: 'low' },
  };
  const toolsUsed = [];

  try {
    const useFallbacks = FALLBACK_MODELS.has(config.model);
    const send = (msgs) =>
      useFallbacks
        ? client.beta.messages.create({ ...base, messages: msgs, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : client.messages.create({ ...base, messages: msgs });

    let response = await send(messages);
    for (let round = 0; response.stop_reason === 'tool_use' && round < MAX_TOOL_ROUNDS; round += 1) {
      const calls = response.content.filter((b) => b.type === 'tool_use');
      // Append the whole assistant turn unchanged (thinking blocks included), then all results in one user turn.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: calls.map((c) => {
          toolsUsed.push(c.name);
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(runTool(c.name, c.input, { crewId, repo: deps.repo })) };
        }),
      });
      response = await send(messages);
    }

    if (response.stop_reason === 'refusal') return offline(question, ctx, 'refusal');
    const text = response.content
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    if (!text) return offline(question, ctx, response.stop_reason === 'tool_use' ? 'too_many_tool_calls' : 'empty_response');
    return { mode: 'ai', model: response.model ?? config.model, answer: text, toolsUsed, truncated: response.stop_reason === 'max_tokens' };
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
