/**
 * Evexia knowledge pack: the sourced NASA facts the Claude assistant answers from.
 *
 * Claude cannot be trained on our data through the API, so it is GROUNDED instead:
 * this pack is sent with every question (as a cached system block, so repeats are
 * cheap), and three read-only tools let Claude look up real data on demand.
 *
 * Everything here comes from the challenge's Resources pages, NASA-STD-3001
 * Volume 1 Revision C, NASA OSDR (Inspiration4 crew data, RadLab) or NASA DONKI.
 * Figures not opened at their source are marked "to be verified" in the text.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENVIRONMENTS, TRIAGE } from '../../client/src/config/thresholds.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const NASA_DIR = path.join(here, '..', 'data', 'nasa');

const OSDR_FILES = {
  cmp: { file: 'OSD-575_LSDS-8_Comprehensive_Metabolic_Panel_CMP_TRANSFORMED.csv', dataset: 'OSD-575', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575' },
  cbc: { file: 'OSD-569_LSDS-7_Complete_Blood_Count_CBC_TRANSFORMED.csv', dataset: 'OSD-569', url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-569' },
};

/** The lab tests Claude may look up, with plain names. Units come from the CSV column names. */
export const LAB_TESTS = {
  glucose: { label: 'Glucose', panel: 'cmp' },
  potassium: { label: 'Potassium', panel: 'cmp' },
  sodium: { label: 'Sodium', panel: 'cmp' },
  calcium: { label: 'Calcium', panel: 'cmp' },
  creatinine: { label: 'Creatinine (kidney function)', panel: 'cmp' },
  white_blood_cell_count: { label: 'White blood cell count', panel: 'cbc' },
  absolute_lymphocytes: { label: 'Lymphocytes (absolute)', panel: 'cbc' },
  hematocrit: { label: 'Hematocrit', panel: 'cbc' },
  hemoglobin: { label: 'Hemoglobin', panel: 'cbc' },
  platelet_count: { label: 'Platelet count', panel: 'cbc' },
};

/**
 * Radiation per environment. `measured` = absorbed dose from NASA RadLab (mGy/day),
 * computed from the readings named. `published` = effective dose (mSv/day) from the
 * literature, with its verification status. Delays from NASA's distance hazard page.
 */
export const RADIATION_REFERENCE = {
  station: {
    measured: { mGyPerDay: 0.51, what: 'ISS DosTel 1 and 2, Columbus module, 12,402 readings, 1–7 March 2024 (NASA RadLab)' },
    published: { mSvPerDay: '0.2 to 0.5', note: 'recent NASA-affiliated papers; to be verified (seen in search results, not opened)' },
  },
  lunar: {
    measured: { mGyPerDay: 0.27, what: 'LRO CRaTER in lunar ORBIT, 301 readings, 1–14 January 2023 (NASA RadLab). No surface instrument in RadLab.' },
    published: { mSvPerDay: '1.369', note: 'lunar surface, Chang\'E-4 lander (Zhang et al., Science Advances, 2020); to be verified (from press coverage)' },
  },
  rover: {
    measured: { mGyPerDay: 0.27, what: 'same as lunar: LRO CRaTER lunar orbit, January 2023 (NASA RadLab)' },
    published: { mSvPerDay: '1.369', note: 'lunar surface figure, as for the lunar base; to be verified' },
  },
  marsTransit: {
    measured: { mGyPerDay: 0.38, what: 'Liulin-MO on ExoMars TGO during its cruise to Mars, 4,326 readings, April–September 2016 (NASA RadLab)' },
    published: { mSvPerDay: 'about 1.8', note: 'NASA: about 1 sievert for 180 days out + 500 on Mars + 180 back, in roughly equal thirds' },
  },
  marsSurface: {
    measured: { mGyPerDay: 0.19, what: 'Curiosity RAD, Gale crater, 274,998 readings, 2015–2024 average (NASA RadLab)' },
    published: { mSvPerDay: '0.67', note: 'Curiosity RAD 2012–2013; to be verified (from a review seen in search results)' },
  },
};

// ---------- OSDR crew data ----------

function parseCsv(text) {
  const [head, ...lines] = text.trim().split(/\r?\n/);
  const cols = head.split(',');
  return lines.filter(Boolean).map((line) => {
    const cells = line.split(',');
    return Object.fromEntries(cols.map((c, i) => [c, cells[i]]));
  });
}

/** "C003_serum_R+45" → { crew: "C003", timepoint: "R+45" } */
function parseSample(name) {
  const m = /^(C\d{3})_.*?_(L-\d+|R\+\d+)/.exec(name || '');
  return m ? { crew: m[1], timepoint: m[2] } : null;
}

const TIMEPOINT_ORDER = ['L-92', 'L-44', 'L-3', 'R+1', 'R+45', 'R+82', 'R+194'];

let osdrCache = null;
function loadOsdr() {
  if (osdrCache) return osdrCache;
  osdrCache = {};
  for (const [panel, meta] of Object.entries(OSDR_FILES)) {
    try {
      osdrCache[panel] = { ...meta, rows: parseCsv(fs.readFileSync(path.join(NASA_DIR, 'osdr', meta.file), 'utf8')) };
    } catch {
      osdrCache[panel] = { ...meta, rows: [] };
    }
  }
  return osdrCache;
}

/** Real Inspiration4 values for one lab test, with the lab's normal range. */
export function getLabData(test) {
  const spec = LAB_TESTS[test];
  if (!spec) return { error: `Unknown test "${test}". Known tests: ${Object.keys(LAB_TESTS).join(', ')}.` };
  const panel = loadOsdr()[spec.panel];
  const header = panel.rows[0] ? Object.keys(panel.rows[0]) : [];
  const valueCol = header.find((c) => c.startsWith(`${test}_value`));
  if (!valueCol) return { error: `No data for ${test} in ${panel.dataset}.` };
  const unit = valueCol.replace(`${test}_value_`, '').replace(/_/g, ' ') || 'unitless';
  const minCol = header.find((c) => c.startsWith(`${test}_range_min`));
  const maxCol = header.find((c) => c.startsWith(`${test}_range_max`) || c.startsWith(`${test}_max`));
  // The lab's normal range is per sample: some tests (e.g. hematocrit) differ between male and female crew.
  const samples = [];
  for (const row of panel.rows) {
    const s = parseSample(row['Sample Name']);
    const v = Number(row[valueCol]);
    if (!s || !Number.isFinite(v)) continue;
    const min = minCol ? Number(row[minCol]) : NaN;
    const max = maxCol ? Number(row[maxCol]) : NaN;
    const range = Number.isFinite(min) && Number.isFinite(max) ? { min, max } : null;
    samples.push({ ...s, value: v, range });
  }
  samples.sort((a, b) => a.crew.localeCompare(b.crew) || TIMEPOINT_ORDER.indexOf(a.timepoint) - TIMEPOINT_ORDER.indexOf(b.timepoint));
  const outside = samples.filter((s) => s.range && (s.value < s.range.min || s.value > s.range.max));
  const ranges = [...new Set(samples.filter((s) => s.range).map((s) => `${s.range.min}–${s.range.max}`))];
  // Pre-computed so the model quotes these numbers instead of doing arithmetic on the sample list.
  const label = (s) => s && `${s.value} (${s.crew} ${s.timepoint})`;
  const byValue = [...samples].sort((a, b) => a.value - b.value);
  const inside = byValue.filter((s) => s.range && s.value >= s.range.min && s.value <= s.range.max);
  const summary = {
    lowest: label(byValue[0]),
    highest: label(byValue[byValue.length - 1]),
    lowestWithinRange: label(inside[0]),
    highestWithinRange: label(inside[inside.length - 1]),
    countOutsideRange: `${outside.length} of ${samples.length}`,
  };
  return {
    summary,
    test: spec.label,
    unit,
    labNormalRange: ranges.length === 1 ? samples.find((s) => s.range).range : null,
    labNormalRanges: ranges,
    dataset: `NASA OSDR ${panel.dataset}, SpaceX Inspiration4 (3-day flight, September 2021)`,
    sourceUrl: panel.url,
    timepointKey: 'L-92/L-44/L-3 = days before launch; R+1/R+45/R+82/R+194 = days after return. Nothing was sampled in flight.',
    samples,
    outsideRange: outside.map((s) => `${s.crew} ${s.timepoint}: ${s.value}`),
    caution: 'Report which values fall outside the lab range. Do not explain why: that is a doctor\'s job.',
  };
}

function labSummaryLine(test) {
  const d = getLabData(test);
  if (d.error || !d.samples.length) return null;
  const pre = d.samples.filter((s) => s.timepoint.startsWith('L'));
  const post = d.samples.filter((s) => s.timepoint === 'R+1');
  const mean = (a) => (a.length ? (a.reduce((x, s) => x + s.value, 0) / a.length).toFixed(1) : 'n/a');
  const range = d.labNormalRanges.length
    ? `${d.labNormalRanges.join(' or ')} ${d.unit}${d.labNormalRanges.length > 1 ? ' (differs by crew member)' : ''}`
    : 'no range given';
  return `- ${d.test}: lab normal ${range}; crew mean before flight ${mean(pre)}, day after return ${mean(post)}; ${d.outsideRange.length} of ${d.samples.length} samples outside the range.`;
}

// ---------- RadLab ----------

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(path.join(NASA_DIR, file), 'utf8'));
  } catch {
    return null;
  }
}

/** Measured and published radiation for one environment, plus the NASA limits. */
export function getRadiationReference(environment) {
  const env = ENVIRONMENTS[environment];
  const ref = RADIATION_REFERENCE[environment];
  if (!env || !ref) return { error: `Unknown environment "${environment}". Known: ${Object.keys(RADIATION_REFERENCE).join(', ')}.` };
  const storm = readJson('radlab-msl-mars-may2024.json');
  return {
    environment: env.label,
    measuredAbsorbedDose: ref.measured,
    publishedEffectiveDose: ref.published,
    oneWayEarthDelay:
      environment === 'marsTransit' || environment === 'marsSurface'
        ? 'up to 20 minutes (NASA distance hazard page)'
        : environment === 'station'
          ? 'near instant'
          : 'about 1.3 seconds (light travel time)',
    units:
      'Measured values are ABSORBED dose (mGy). Limits are EFFECTIVE dose (mSv), which also weighs how harmful each particle type is, so the mSv number for the same day is larger. Do not convert one into the other.',
    nasaLimits: {
      career: 'below 600 mSv effective dose, all ages and sexes [NASA-STD-3001 V1 4030]',
      solarParticleEvent: 'below 250 mSv per event [V1 4031]',
      habitatDesign: 'everyday cosmic radiation below 1.3 mSv/day in free space and 0.9 mSv/day on a planetary surface; a spacecraft DESIGN limit, not a body limit [V1 4033]',
    },
    realSolarEvent: storm?.summary
      ? `Curiosity on Mars, 20 May 2024: daily mean ${storm.summary.peakDayMeanUGyPerHour} µGy/h, peak ${Math.round(storm.summary.peakDayMaxUGyPerHour)} µGy/h, about ${storm.summary.peakDayTimesBaseline}× the quiet-day level; back to normal within two days (NASA RadLab).`
      : null,
  };
}

// ---------- The pack ----------

/**
 * How Evexia prioritises (IITT + ABCDE), written from the same TRIAGE config the app scores with,
 * so the assistant's explanation can never drift from the numbers on screen.
 */
export function triageSection() {
  const tiers = ['red', 'amber', 'green']
    .map((k) => `- ${TRIAGE.tiers[k].colour} (${TRIAGE.tiers[k].label}): target ${TRIAGE.tiers[k].target.toLowerCase()}.`)
    .join('\n');
  const tracked = new Set(['spo2', 'hr', 'bp', 'glucose', 'temp', 'sleep', 'radiation']);
  const NAMES = { spo2: 'blood oxygen', hr: 'heart rate', bp: 'blood pressure', glucose: 'glucose', pvt: 'reaction time', sans: 'SANS vision', radiation: 'radiation dose', temp: 'temperature', sleep: 'sleep', mood: 'mood and stress', exercise: 'exercise' };
  const ranks = TRIAGE.ranks
    .map((r) => {
      const ind = Object.entries(r.weights).map(([id, w]) => `${NAMES[id]} ${w}%${tracked.has(id) ? '' : ' (not measured yet)'}`).join(', ');
      return `- Rank ${r.rank}, ${r.letter} ${r.label}: ${ind}. Amber caps the overall score at ${r.amberCap}%, red at ${r.redCap}%.`;
    })
    .join('\n');
  return `## How Evexia prioritises: IITT colour tiers and the ABCDE survey (team design guide based on the Interagency Integrated Triage Tool by WHO, ICRC and MSF)
Colour tier comes first, then the ABCDE primary survey (airway and breathing, circulation, disability, exposure, behaviour):
${tiers}
${ranks}
- Health score: each reading scores 85–100 in green (100 at the middle of its range), 79 down to 50 in amber, 39 down to 0 in red. The weighted average loses ${TRIAGE.penalty.amber} points for each extra amber flag and ${TRIAGE.penalty.red} for each extra red flag, then is capped by the most urgent flag (colour first, then ABCDE rank). All green and no cap: 85–100.
- Flight surgeon queue: priority = colour (red ${TRIAGE.tiers.red.weight}, amber ${TRIAGE.tiers.amber.weight}, green ${TRIAGE.tiers.green.weight}) + ABCDE rank of the top flag (A/B 50, C 40, D 30, E 20, behaviour 10) + ${TRIAGE.flagCountWeight} per flag. Higher is seen first.
- Reaction time, SANS vision, mood and exercise are in the method but Evexia does not measure them yet; their weight is shared by the readings it does measure.
- When explaining a score, use the "Triage" lines in the context: they are computed by Evexia. Do not recompute the numbers yourself.`;
}

function buildPack() {
  const labs = ['glucose', 'white_blood_cell_count', 'hematocrit', 'potassium', 'calcium'].map(labSummaryLine).filter(Boolean).join('\n');
  const env = Object.entries(RADIATION_REFERENCE)
    .map(([id, r]) => `- ${ENVIRONMENTS[id].label}: measured ${r.measured.mGyPerDay} mGy/day absorbed (${r.measured.what}); published ${r.published.mSvPerDay} mSv/day (${r.published.note}).`)
    .join('\n');
  return `<evexia_knowledge>
Use this sourced knowledge to answer. When a fact below supports your answer, name its source in brackets, for example [NASA-STD-3001] or [NASA OSDR]. If the answer is not covered here or in a tool result, say you do not have that information rather than guessing. Never present a "demonstration" threshold as a NASA standard.

## NASA limits and targets (NASA-STD-3001 Volume 1, Revision C)
- Career radiation: total effective dose below 600 mSv, the same for all ages and sexes [V1 4030].
- One solar particle event: below 250 mSv [V1 4031]. Shielding and a storm shelter are part of the design.
- Habitat design: everyday cosmic radiation below 1.3 mSv/day in free space, 0.9 mSv/day on a planet's surface [V1 4033]. This is a spacecraft design limit, not a body limit.
- Sleep: a recommended 8.5-hour sleep period; avoid critical tasks between 1 and 7 a.m. body-clock time [V1 6001].
- Body temperature: normal is around 37 °C; hypothermia starts below 35 °C (Appendix A).
- Muscle strength kept at 80% or more of baseline [V1 4024]; hip and spine bone density at 95% or more of pre-flight [V1 4027].
- At least two crew per vehicle are trained as Crew Medical Officers [V1 3006].
- High-consequence in-mission conditions NASA plans for include acute coronary syndrome, angina or heart attack, and sudden cardiac arrest (Table E.2-2).

## What Evexia's thresholds are
- Sourced: glucose green 65–99 mg/dL (Inspiration4 lab range, NASA OSDR); temperature red below 35.0 °C (NASA-STD-3001); 8.5 h sleep target; radiation limits above.
- Demonstration values, to be verified: blood oxygen (green 95% or more, amber 90–94%, red below 90%, the usual clinical bands), heart rate, blood pressure, upper glucose bands and fever bands. NASA publishes no green/amber/red cut-offs for these, and NASA's open data holds no astronaut vital signs.

## Radiation by environment (NASA RadLab measurements and published figures)
${env}
- Real solar event: Curiosity on Mars, 20 May 2024, the daily average rose about 16 to 18 times above quiet days and returned to normal within two days.
- Neutrons make up about 30% of radiation on the ISS (Canadian Space Agency).

## Real crew blood results (NASA OSDR, Inspiration4, 3-day flight, 2021; sampled before and after flight only)
${labs}

## Why each reading matters in space, and what NASA does (NASA Human Research Program pages)
- Heart rate and blood pressure (gravity fields hazard): fluids shift toward the head; moving into gravity can bring lightheadedness and fainting. Low gravity can cause heart rhythm problems and low blood pressure. NASA uses regular exercise, a healthy diet, lower-body compression garments and extra fluids before landing.
- Temperature and infection (hostile closed environment hazard): stress hormones can rise and the immune system can change; dormant viruses such as cold sores and shingles can reactivate. NASA uses flu vaccination and tracks immune changes with blood, saliva and urine samples.
- Sleep (isolation and confinement hazard): sleep loss, a disrupted body clock and work overload add up and hurt performance. ISS crews see 16 sunrises a day. NASA uses day-night LED lighting, set times for rest and self-care, and wrist-worn sleep trackers. A 2014 study found ISS crews averaged about 6 hours of sleep a night.
- Mood and stress (isolation and confinement): NASA encourages journaling; windows, privacy and growing plants help.
- Radiation (space radiation hazard): raises cancer risk and can affect the brain, heart and eyes. Instruments on the ISS measure exposure; shelters protect during solar events.
- Bone and muscle (gravity fields): bones lose 1% to 1.5% of density a month in weightlessness; ISS crews exercise about 1.5 hours a day, six to seven days a week.
- Distance from Earth: on Mars the one-way message delay is up to 20 minutes, so crews must handle medical emergencies with minimal support from Earth.

${triageSection()}

## How often problems happen on a mission (NASA Integrated Medical Model sample, ISS missions, NASA-STD-3001 Table E.2-1)
Late insomnia 13.85 per mission; late headache 5.25; respiratory infection 3.46; space-adaptation insomnia 2.70; CO2 headache 2.15; SANS eye changes 2.08; allergic reaction 1.18; influenza 0.11.

## Tools you can use
- get_radiation_reference: measured and published radiation for an environment, with NASA limits.
- get_inspiration4_lab_data: real Inspiration4 crew values for one blood test, with the lab's normal range.
- get_my_recent_readings: this astronaut's own logged readings for recent days.
Use a tool only when the question needs data that is not already in the context or this pack.
</evexia_knowledge>`;
}

let packCache = null;
/** The knowledge pack text. Built once and reused, so the cached prompt prefix stays byte-identical. */
export function getKnowledgePack() {
  if (!packCache) packCache = buildPack();
  return packCache;
}
