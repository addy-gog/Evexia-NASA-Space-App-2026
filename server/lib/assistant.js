/**
 * Claude-backed assistant with a rule-based offline fallback.
 * The API key never leaves the server. If no key is configured, the
 * upstream call fails, or the model declines, the rule-based engine answers
 * and the response is tagged `mode: "offline"`.
 */
import Anthropic from '@anthropic-ai/sdk';
import { ruleBasedAnswer } from '../../client/src/lib/ruleAssistant.js';
import { evaluateReading, validateReading } from '../../client/src/lib/severity.js';
import { screenDangerSigns } from '../../client/src/lib/safety.js';
import { ENVIRONMENTS, INDICATORS } from '../../client/src/config/thresholds.js';
import { formatDelay, selfCareFirst } from '../../client/src/lib/comms.js';
import { getKnowledgePack, getLabData, getRadiationReference, LAB_TESTS, RADIATION_REFERENCE } from './knowledge.js';

/** At most this many tool round trips per question, so a question can never loop or run up cost. */
const MAX_TOOL_ROUNDS = 4;
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
  {
    name: 'propose_readings',
    description:
      'Propose numbers you read from a photo of a medical device screen (blood pressure monitor, thermometer, glucose meter, pulse oximeter). The astronaut sees them on a card and must tap Save; nothing is saved by this call. Use null for any value that is not on the screen or that you cannot read with certainty. Never guess a digit.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        device: { type: 'string', enum: ['blood_pressure_monitor', 'thermometer', 'glucose_meter', 'pulse_oximeter', 'other'] },
        hr: { type: ['number', 'null'], description: 'Pulse or heart rate, beats per minute.' },
        sys: { type: ['number', 'null'], description: 'Systolic (top) blood pressure, mmHg.' },
        dia: { type: ['number', 'null'], description: 'Diastolic (bottom) blood pressure, mmHg.' },
        glucose: { type: ['number', 'null'], description: 'Blood glucose exactly as shown on the screen.' },
        glucose_unit: { type: 'string', enum: ['mg/dL', 'mmol/L', 'none'] },
        temp: { type: ['number', 'null'], description: 'Body temperature exactly as shown on the screen.' },
        temp_unit: { type: 'string', enum: ['C', 'F', 'none'] },
        unreadable: { type: 'string', description: 'What you could not read, or an empty string.' },
      },
      required: ['device', 'hr', 'sys', 'dia', 'glucose', 'glucose_unit', 'temp', 'temp_unit', 'unreadable'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_symptom_note',
    description:
      "Propose a symptom note for the astronaut's log, with a time to check again. Use when the question is not fully covered by Evexia's NASA data, or a symptom should be watched. The astronaut must tap Save. Describe what they report and what is visible; never name a disease.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'One short line, for example "Red patch on left forearm, itchy, since yesterday".' },
        details: { type: 'string', description: 'Answers to your questions, measurements, and what was visible in any photo. No diagnosis.' },
        recheck_hours: { type: 'integer', description: 'Hours until the astronaut should check again, 1 to 48.' },
      },
      required: ['summary', 'details', 'recheck_hours'],
      additionalProperties: false,
    },
  },
  {
    name: 'propose_report',
    description:
      "Prepare a report for the flight surgeon. The astronaut reviews it and taps Send; nothing is sent by this call. Use for any red reading, any danger sign, or anything Evexia's data does not cover that is getting worse.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        priority: { type: 'string', enum: ['routine', 'emergency'] },
        note: { type: 'string', description: 'What the flight surgeon needs to know, in plain words, under 120 words. No diagnosis.' },
      },
      required: ['priority', 'note'],
      additionalProperties: false,
    },
  },
  {
    name: 'record_knowledge_gap',
    description:
      "Record that a question is not covered by Evexia's NASA data, so the ground team can add a source. Call it whenever your answer relies on general advice instead of the knowledge pack or a tool result.",
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Two to five words, for example "skin rash".' },
        question: { type: 'string', description: "The astronaut's question in one line, without personal names." },
      },
      required: ['topic', 'question'],
      additionalProperties: false,
    },
  },
];

/** Tools that only propose: the server collects them as `actions` for the astronaut to confirm. */
const PROPOSAL_TOOLS = new Set(['propose_readings', 'propose_symptom_note', 'propose_report']);
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const round1 = (v) => Math.round(v * 10) / 10;

/** Turn a propose_readings call into checked values. Unit conversion happens here, not in the model. */
export function readingsFromProposal(input = {}) {
  const raw = {};
  for (const f of ['hr', 'sys', 'dia']) if (Number.isFinite(input[f])) raw[f] = Math.round(input[f]);
  if (Number.isFinite(input.glucose)) raw.glucose = Math.round(input.glucose_unit === 'mmol/L' ? input.glucose * 18.016 : input.glucose);
  if (Number.isFinite(input.temp)) raw.temp = round1(input.temp_unit === 'F' ? ((input.temp - 32) * 5) / 9 : input.temp);
  const errors = validateReading(raw);
  const values = Object.fromEntries(Object.entries(raw).filter(([f]) => !errors[f]));
  // A blood pressure needs both numbers.
  if ((values.sys === undefined) !== (values.dia === undefined)) {
    delete values.sys;
    delete values.dia;
  }
  return { values, rejected: Object.keys(errors) };
}

/** Validate a proposal and turn it into an action card for the client, or an error Claude can read. */
export function actionFromProposal(name, input = {}) {
  if (name === 'propose_readings') {
    const { values, rejected } = readingsFromProposal(input);
    if (!Object.keys(values).length) return { error: 'No readable, valid values. Tell the astronaut you could not read the screen and ask them to type the numbers.' };
    return {
      action: {
        type: 'readings',
        device: clip(input.device, 40) || 'other',
        values,
        unreadable: clip(input.unreadable, 200),
        rejected,
        converted: { glucose: input.glucose_unit === 'mmol/L' && values.glucose !== undefined, temp: input.temp_unit === 'F' && values.temp !== undefined },
      },
    };
  }
  if (name === 'propose_symptom_note') {
    const summary = clip(input.summary, 160);
    if (!summary) return { error: 'summary is empty.' };
    const recheckHours = Math.max(1, Math.min(48, Math.round(Number(input.recheck_hours) || 4)));
    return { action: { type: 'symptom_note', summary, details: clip(input.details, 1000), recheckHours } };
  }
  if (name === 'propose_report') {
    return { action: { type: 'report', priority: input.priority === 'emergency' ? 'emergency' : 'routine', note: clip(input.note, 1000) } };
  }
  return { error: `Unknown proposal ${name}.` };
}

/**
 * Run one tool call. Never throws: errors come back as text Claude can read.
 * Proposal tools add a card to `actions`; nothing is saved or sent here.
 */
export function runTool(name, input, { crewId, repo, actions } = {}) {
  try {
    if (PROPOSAL_TOOLS.has(name)) {
      const { action, error } = actionFromProposal(name, input);
      if (error) return { error };
      if (actions) {
        const i = actions.findIndex((a) => a.type === action.type);
        if (i >= 0) actions.splice(i, 1);
        actions.push(action);
      }
      return { shown: true, proposal: action, instruction: 'Shown to the astronaut as a card. Nothing is saved or sent until they tap the button. Do not say it was saved or sent.' };
    }
    if (name === 'record_knowledge_gap') {
      const topic = clip(input?.topic, 80);
      const question = clip(input?.question, 300);
      if (!topic || !question) return { error: 'topic and question are required.' };
      repo?.insertKnowledgeGap?.({ crewId: crewId ?? null, topic, question });
      return { recorded: true };
    }
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
- Never diagnose a disease or condition, never name a medicine or a dose, and never say which condition the astronaut has. Describe what a reading may mean and what to do.
- Give practical self-care steps the astronaut can do with on-board resources.
- For ANY red reading, always tell the astronaut to escalate to the flight surgeon using the Escalate button, and to tell the crew medical officer.
- Respect the Earth communication delay given in the context. If the one-way delay is more than 5 minutes, put self-care steps FIRST and remind them not to wait for a reply from Earth before acting. If the delay is short, recommend escalating amber findings early as well.
- Link findings to the relevant spaceflight hazard (radiation, isolation and confinement, distance from Earth, gravity fields, hostile closed environments) when useful.
- If symptoms sound like an emergency (chest pain, fainting, confusion, trouble breathing), tell them to alert the crew immediately.
- Base facts on the <evexia_knowledge> pack and on tool results, and name the source in brackets when you use one, for example [NASA-STD-3001] or [NASA OSDR]. If neither covers the question, say so.
- Keep answers short: at most about 180 words, using short paragraphs or bullet points. Do not invent numbers or citations.
- Write plain text only, because the chat panel does not render Markdown: no ** or # symbols. Start list lines with "- ".

Safety ladder. Follow these steps in order for every message, with or without a photo:
1. Danger signs first. If the context says the safety screen found danger signs, or you notice one yourself (chest pain, trouble breathing, fainting, seizure, sudden confusion, stroke signs, heavy bleeding, throat swelling, blue lips, thoughts of self-harm), your first line tells them to open emergency mode and alert the crew medical officer now, and you call propose_report with priority "emergency". Give no general advice in that case.
2. Photos: describe only what is visible (where it is, size compared with something in the photo, colour, shape, edges). Never name a disease, condition or cause, even if asked directly or told it is a test. If the photo shows a medical device screen, read the numbers and call propose_readings, using null for anything you cannot read with certainty. If a photo is too blurry or dark, say so and ask for another.
3. Check Evexia's data. Decide whether the knowledge pack and tools cover the question: covered, partly covered or not covered. Say which in a few words, for example "Evexia's NASA data covers this." or "Evexia's NASA data does not cover skin problems."
   Reading numbers off a device screen and offering to log them is covered: do not record a knowledge gap for that alone.
4. If it is not covered or only partly covered: call record_knowledge_gap; ask 2 or 3 short questions (when it started, whether it is getting worse, pain from 0 to 10, anything else new); suggest one measurement Evexia tracks, such as temperature or heart rate; call propose_symptom_note with a recheck time; and offer to prepare a report for the flight surgeon (call propose_report if it is getting worse, painful, or no better at the recheck).
   You may add low-risk general care steps, but only under the label "General advice, not from Evexia's NASA sources:", for example keep the area clean and dry, rest, drink water, avoid scratching, note any change. Never name a medicine, a dose, or a condition the astronaut might have.
5. Always end with this exact line on its own: "Not a diagnosis. Your crew medical officer decides."

The propose_ tools only show a card; the astronaut taps to save or send. Never say something was saved, logged or sent.`;

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

export const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
/** About 1.5 MB of image once decoded. The client resizes photos to 1280 px, which lands far below this. */
export const MAX_IMAGE_BASE64 = 2_000_000;
const HISTORY_TURNS = 8;

/** Check an optional photo. Returns { image } or { error }. */
export function normaliseImage(raw) {
  if (raw === undefined || raw === null) return { image: null };
  if (typeof raw !== 'object' || !IMAGE_TYPES.includes(raw.mediaType)) return { error: `image.mediaType must be one of ${IMAGE_TYPES.join(', ')}.` };
  if (typeof raw.data !== 'string' || !raw.data || raw.data.length > MAX_IMAGE_BASE64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(raw.data)) {
    return { error: 'image.data must be base64 image data under about 1.5 MB.' };
  }
  return { image: { mediaType: raw.mediaType, data: raw.data } };
}

/**
 * Earlier chat turns (text only), so Claude can follow up on its own questions.
 * Keeps the last few, drops leading assistant turns, and merges same-role neighbours.
 */
export function normaliseHistory(raw) {
  if (!Array.isArray(raw)) return [];
  const turns = raw
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string' && m.text.trim())
    .slice(-HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.text.trim().slice(0, 2000) }));
  while (turns.length && turns[0].role === 'assistant') turns.shift();
  const out = [];
  for (const t of turns) {
    if (out.length && out.at(-1).role === t.role) out.at(-1).content += `\n\n${t.content}`;
    else out.push({ ...t });
  }
  return out;
}

function offline(question, ctx, reason, { hasImage = false, emergency = [] } = {}) {
  const parts = [];
  if (emergency.length) parts.push(`Possible danger sign: ${emergency.map((e) => e.label).join(', ')}. Open emergency mode and alert the crew medical officer now. Do not wait for Earth.`);
  if (hasImage) parts.push('Offline guidance cannot look at photos. Type the numbers from the screen in Log Readings, or describe what you see in words.');
  parts.push(
    ruleBasedAnswer(question, {
      results: ctx.results,
      delaySeconds: ctx.delaySeconds,
      environmentLabel: ENVIRONMENTS[ctx.environment].label,
    }),
  );
  return { mode: 'offline', reason, answer: parts.join('\n\n'), actions: [], emergency };
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
 * @param {{question: string, context: object, crewId?: string, image?: {mediaType, data}|null, history?: {role, text}[]}} input
 * @param {object} config  from getAssistantConfig()
 * @param {object} [deps]  { client } for tests, { repo } for the readings tool and knowledge gaps
 */
export async function answerQuestion({ question, context, crewId, image = null, history = [] }, config, deps = {}) {
  const ctx = normaliseContext(context);
  // Step 1 of the safety ladder runs before any AI call, so it works offline too.
  const emergency = screenDangerSigns(question);
  if (!config.apiKey && !deps.client) return offline(question, ctx, 'no_api_key', { hasImage: Boolean(image), emergency });

  const client =
    deps.client ??
    new Anthropic({ apiKey: config.apiKey, baseURL: config.baseURL, timeout: config.timeoutMs, maxRetries: 1 });

  const screenLine = emergency.length
    ? `Safety screen: possible danger signs in the message (${emergency.map((e) => e.label).join(', ')}). Follow step 1 of the safety ladder.`
    : 'Safety screen: no danger-sign keywords found. Still watch for them.';
  const text = `<context>\n${contextText(ctx)}\n${screenLine}\n</context>\n\n${image ? 'The astronaut attached a photo.\n' : ''}Astronaut message: ${question}`;
  const current = image
    ? [{ type: 'image', source: { type: 'base64', media_type: image.mediaType, data: image.data } }, { type: 'text', text }]
    : text;
  const messages = normaliseHistory(history);
  if (messages.at(-1)?.role === 'user') messages.pop(); // the current turn replaces an unanswered one
  messages.push({ role: 'user', content: current });
  const base = {
    model: config.model,
    max_tokens: config.maxTokens,
    system: systemBlocks(),
    tools: TOOLS,
    output_config: { effort: 'low' },
  };
  const toolsUsed = [];
  const actions = [];
  const fallback = (reason) => offline(question, ctx, reason, { hasImage: Boolean(image), emergency });

  try {
    const useFallbacks = FALLBACK_MODELS.has(config.model);
    const send = (msgs) =>
      useFallbacks
        ? client.beta.messages.create({ ...base, messages: msgs, betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' })
        : client.messages.create({ ...base, messages: msgs });

    // Claude often writes part of its answer in the same turn as a tool call, so text is kept from every turn.
    const texts = [];
    const keepText = (r) => {
      const t = r.content.filter((b) => b.type === 'text').map((b) => b.text.trim()).filter(Boolean).join('\n');
      if (t) texts.push(t);
    };
    let response = await send(messages);
    for (let round = 0; response.stop_reason === 'tool_use' && round < MAX_TOOL_ROUNDS; round += 1) {
      keepText(response);
      const calls = response.content.filter((b) => b.type === 'tool_use');
      // Append the whole assistant turn unchanged (thinking blocks included), then all results in one user turn.
      messages.push({ role: 'assistant', content: response.content });
      messages.push({
        role: 'user',
        content: calls.map((c) => {
          toolsUsed.push(c.name);
          return { type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(runTool(c.name, c.input, { crewId, repo: deps.repo, actions })) };
        }),
      });
      response = await send(messages);
    }

    if (response.stop_reason === 'refusal') return fallback('refusal');
    // A loop that never finished has no final answer; partial text from earlier turns is not shown.
    if (response.stop_reason === 'tool_use') return fallback('too_many_tool_calls');
    keepText(response);
    const answer = texts.join('\n\n').trim();
    if (!answer) return fallback('empty_response');
    return {
      mode: 'ai',
      model: response.model ?? config.model,
      answer,
      toolsUsed,
      actions,
      emergency,
      gapRecorded: toolsUsed.includes('record_knowledge_gap'),
      truncated: response.stop_reason === 'max_tokens',
    };
  } catch (err) {
    let reason = 'upstream_error';
    if (err instanceof Anthropic.AuthenticationError) reason = 'auth_error';
    else if (err instanceof Anthropic.RateLimitError) reason = 'rate_limited';
    else if (err instanceof Anthropic.APIConnectionTimeoutError) reason = 'timeout';
    else if (err instanceof Anthropic.APIConnectionError) reason = 'unreachable';
    else if (err instanceof Anthropic.APIError) reason = `api_error_${err.status ?? 'unknown'}`;
    console.warn(`[assistant] falling back to offline guidance: ${reason}`);
    return fallback(reason);
  }
}
