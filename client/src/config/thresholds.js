/**
 * Evexia threshold configuration: the single place to tune every limit.
 *
 * Heart rate, blood pressure, glucose (upper bands) and fever bands are
 * PROPOSED demonstration values: NASA publishes no green/amber/red limits for
 * them and there is no open astronaut vital-sign dataset, so they stay
 * labelled "to be verified". Where NASA does publish a number (radiation
 * limits, sleep period, hypothermia, Inspiration4 glucose lab range) it is
 * used and cited.
 *
 * `verified: true` on a source means the page/data was opened and checked
 * during the build. `false` means "to be verified" and is shown as such.
 */

export const DISCLAIMER =
  'Demonstration thresholds. Not medical advice. Verify against NASA-STD-3001 and flight surgeon guidance.';

export const SOURCES = {
  HRP_HAZARDS: {
    id: 'HRP_HAZARDS',
    label: 'NASA HRP – Human Research Program hazards (RIDGE)',
    url: 'https://www.nasa.gov/hrp/hazards/',
    verified: true, // opened 14 Nov 2026
  },
  HRP_BODY: {
    id: 'HRP_BODY',
    label: 'NASA – The Human Body in Space (five hazards of human spaceflight)',
    url: 'https://www.nasa.gov/humans-in-space/the-human-body-in-space/',
    verified: true, // opened 14 Nov 2026
  },
  STD3001: {
    id: 'STD3001',
    label: 'NASA-STD-3001 Vol. 1 Rev. C (8.5 h sleep period [V1 6001]; hypothermia below 35 °C)',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf',
    verified: true, // full PDF read 14 Nov 2026
  },
  STD3001_RAD: {
    id: 'STD3001_RAD',
    label: 'NASA-STD-3001 Vol. 1 Rev. C – 600 mSv career effective dose [V1 4030]; 250 mSv per solar particle event [V1 4031]',
    url: 'https://www.nasa.gov/wp-content/uploads/2023/11/nasa-std-3001-vol-1-rev-c-with-signature.pdf',
    verified: true, // full PDF read 14 Nov 2026
  },
  OSDR_I4: {
    id: 'OSDR_I4',
    label: 'NASA OSDR OSD-575 – Inspiration4 crew blood results (glucose lab normal range 65–99 mg/dL)',
    url: 'https://osdr.nasa.gov/bio/repo/data/studies/OSD-575',
    verified: true, // data file downloaded and checked 14 Nov 2026; bundled in server/data/nasa/osdr
  },
  RADLAB: {
    id: 'RADLAB',
    label: 'NASA OSDR RadLab – measured space radiation (absorbed dose rate, µGy/h)',
    url: 'https://visualization.osdr.nasa.gov/radlab/',
    verified: true, // API queried during the build; data bundled in server/data/nasa
  },
  DONKI: {
    id: 'DONKI',
    label: 'NASA CCMC DONKI – solar particle events and flares',
    url: 'https://ccmc.gsfc.nasa.gov/tools/DONKI/',
    verified: true, // web service queried during the build
  },
  MSL_RAD_LIT: {
    id: 'MSL_RAD_LIT',
    label: 'MSL RAD published dose-equivalent ratios (Zeitlin 2013 cruise; Hassler 2014 surface)',
    url: null,
    verified: false, // literature values not opened during the build
  },
  SPACE_APPS: {
    id: 'SPACE_APPS',
    label: 'NASA Space Apps Challenge 2026 – challenge resources',
    url: 'https://www.spaceappschallenge.org/2026/challenges/health-monitoring-software/?tab=resources',
    verified: true, // opened 14 Nov 2026
  },
  CLINICAL_REF: {
    id: 'CLINICAL_REF',
    label: 'Terrestrial clinical reference ranges (adapted for demo, to be verified)',
    url: null,
    verified: false,
  },
};

/** Plausibility limits for inline validation (impossible values are rejected). */
export const VALID_RANGES = {
  hr: { min: 20, max: 250, step: 1 },
  sys: { min: 50, max: 260, step: 1 },
  dia: { min: 30, max: 160, step: 1 },
  glucose: { min: 20, max: 600, step: 1 },
  temp: { min: 30, max: 43, step: 0.1 },
  sleep: { min: 0, max: 16, step: 0.1 },
  radiation: { min: 0, max: 50, step: 0.001 }, // absorbed dose, mGy/day
};

/** Indicator catalogue: id, label, unit, score weight and 3D body region. */
export const INDICATORS = [
  { id: 'hr', label: 'Resting heart rate', short: 'Heart rate', unit: 'bpm', weight: 20, region: 'heart', fields: ['hr'] },
  { id: 'bp', label: 'Blood pressure', short: 'Blood pressure', unit: 'mmHg', weight: 20, region: 'vessels', fields: ['sys', 'dia'] },
  { id: 'glucose', label: 'Fasting blood glucose', short: 'Glucose', unit: 'mg/dL', weight: 15, region: 'pancreas', fields: ['glucose'] },
  { id: 'temp', label: 'Body temperature', short: 'Temperature', unit: '°C', weight: 10, region: 'skin_shell', fields: ['temp'] },
  { id: 'sleep', label: 'Sleep', short: 'Sleep', unit: 'h', weight: 20, region: 'brain', fields: ['sleep'] },
  { id: 'radiation', label: 'Radiation dose (dosimeter)', short: 'Radiation', unit: 'mGy/day', weight: 15, region: 'radiation_shell', fields: ['radiation'] },
];

export const INDICATOR_IDS = INDICATORS.map((i) => i.id);
export const READING_FIELDS = ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep', 'radiation'];

/**
 * Absolute thresholds. `green` is the inclusive green range. `amber` is the
 * inclusive OUTER range: inside it but outside green is amber, outside it is
 * red. Continuous comparisons, so decimals behave (49.5 bpm amber).
 */
export const THRESHOLDS = {
  hr: { green: [50, 90], amber: [40, 100], sources: ['CLINICAL_REF'] },
  sys: { green: [95, 129], amber: [90, 139], sources: ['CLINICAL_REF'] },
  dia: { green: [60, 84], amber: [60, 89], sources: ['CLINICAL_REF'] },
  // Green lower bound 65 mg/dL = Inspiration4 lab normal range (OSDR). Upper bands demo values.
  glucose: { green: [65, 99], amber: [60, 125], sources: ['OSDR_I4', 'CLINICAL_REF'] },
  // Red below 35.0 °C = hypothermia (NASA-STD-3001). Fever bands demo values.
  temp: { green: [36.1, 37.2], amber: [35.0, 38.0], sources: ['STD3001', 'CLINICAL_REF'] },
  sleep: {
    greenMin: 7, // >= 7 h asleep green
    amberMin: 6,
    redSingleNight: 5,
    redConsecutiveBelow: 6,
    redConsecutiveNights: 2,
    recommendedSleepPeriod: 8.5, // NASA-STD-3001 recommended sleep period (time allotted, not time asleep)
    sources: ['STD3001', 'HRP_HAZARDS'],
  },
  radiation: {
    // Limits are EFFECTIVE dose (mSv). Logged readings are ABSORBED dose (mGy), converted with the
    // environment's quality factor below (an estimate). Red above 2.0 mSv/day or during an SPE.
    redAboveMsv: 2.0,
    sources: ['STD3001_RAD', 'RADLAB'],
  },
  cumulative: { careerLimit: 600, amberPct: 50, redPct: 80, sources: ['STD3001_RAD'] },
  speEvent: { limit: 250, sources: ['STD3001_RAD'] }, // mSv per solar particle event
};

/** Personal baseline mode (see severity.js). */
export const BASELINE_RULES = {
  amberPct: 15,
  redPct: 25,
  temp: { amberDelta: 0.6, redDelta: 1.0 },
  appliesTo: ['hr', 'sys', 'dia', 'glucose', 'temp', 'sleep'],
};

export const DEFAULT_BASELINE = { hr: 62, sys: 116, dia: 74, glucose: 88, temp: 36.7, sleep: 7.5 };

/** Health score configuration (score.js). */
export const SCORE = {
  points: { green: 100, amber: 60, red: 20 },
  redCap: 59,
  bands: [
    { min: 85, label: 'Mission ready', severity: 'green' },
    { min: 60, label: 'Monitor closely', severity: 'amber' },
    { min: 0, label: 'Act now', severity: 'red' },
  ],
};

/**
 * Clinical prioritisation (lib/triage.js): the Interagency Integrated Triage Tool (IITT, WHO / ICRC / MSF)
 * colour tiers, ranked inside each tier by the ABCDE primary survey. Each ABCDE rank has its own ceiling on
 * the overall health %, so the number itself shows how urgent the worst problem is.
 * Source: "IITT Clinical Prioritization Guide" (team design doc, Nov 2026). Weights and caps from that guide;
 * the `critical` extremes used to grade how deep a reading sits in its red zone are demonstration values.
 *
 * Indicators listed under a rank but not measured by Evexia yet (spo2, pvt, sans, mood, exercise) are
 * skipped: the weights of the readings present are renormalised, exactly as missing readings are today.
 */
export const TRIAGE = {
  tiers: {
    red: { label: 'Emergent', colour: 'Red', target: 'Immediate', targetMinutes: 0, weight: 1000 },
    amber: { label: 'Urgent', colour: 'Yellow', target: 'Within 60 min', targetMinutes: 60, weight: 500 },
    green: { label: 'Non-urgent', colour: 'Green', target: 'Routine (24 h)', targetMinutes: 1440, weight: 100 },
  },
  // ABCDE primary survey, highest priority first. `weights` are the guide's clinical weights in % (sum 100).
  ranks: [
    { rank: 1, letter: 'A/B', label: 'Airway & breathing', amberCap: 72, redCap: 39, rankScore: 50, weights: { spo2: 25 } },
    { rank: 2, letter: 'C', label: 'Circulation', amberCap: 76, redCap: 45, rankScore: 40, weights: { hr: 12.5, bp: 12.5 } },
    { rank: 3, letter: 'D', label: 'Disability (neuro & glucose)', amberCap: 80, redCap: 50, rankScore: 30, weights: { glucose: 8, pvt: 7, sans: 5 } },
    { rank: 4, letter: 'E', label: 'Exposure, thermal & radiation', amberCap: 82, redCap: 55, rankScore: 20, weights: { radiation: 8, temp: 7 } },
    { rank: 5, letter: 'Beh', label: 'Behaviour & countermeasures', amberCap: 84, redCap: 59, rankScore: 10, weights: { sleep: 6, mood: 5, exercise: 4 } },
  ],
  // Per-reading score range inside each zone (Step 1 of the guide).
  zone: { green: [85, 100], amber: [50, 79], red: [0, 39] },
  // Extra flags in the same colour cost points (Step 3).
  penalty: { amber: 3, red: 7 },
  flagCountWeight: 5,
  // A reading at or beyond these limits scores 0 % (demonstration values). [low, high] for two-sided readings.
  critical: { hr: [30, 150], sys: [70, 200], dia: [40, 120], glucose: [40, 250], temp: [32, 40.5], sleepHours: 3, radiationMsv: 10 },
  // Sleep scores 100 % at this many hours or more, 85 % at the 7 h green minimum.
  sleepOptimal: 8,
};

/** Comms delay above which the self-care protocol is shown first (seconds). */
export const SELF_CARE_DELAY_SECONDS = 5 * 60;

/** A reading older than this no longer counts as "current" (shown as stale). */
export const STALE_AFTER_HOURS = 36;

/**
 * Mission environments.
 * - `qualityFactor` converts measured absorbed dose (mGy) to an ESTIMATED effective dose (mSv).
 *   Values are approximate mean quality factors from published dosimetry and are to be verified.
 * - `measuredMGyPerDay`: real RadLab measurement where available (server/data/nasa).
 * - `radiationGreenBelowMsv` shifts the green limit per environment.
 */
export const ENVIRONMENTS = {
  station: {
    id: 'station',
    label: 'Space station (LEO)',
    qualityFactor: 2.0,
    measuredMGyPerDay: 0.48, // ISS DosTel 15 May 2024 (RadLab), mean of DosTel1/2
    radiationGreenBelowMsv: 0.8,
    delaySeconds: { min: 0, max: 0, default: 0 },
    autonomy: 'Low',
    autonomyNote: 'Escalate readily: the flight surgeon is a call away.',
    hazardNote: 'Inside Earth’s magnetic field: lower radiation, frequent crew contact, quick return option.',
  },
  lunar: {
    id: 'lunar',
    label: 'Lunar base / surface',
    qualityFactor: 3.0,
    measuredMGyPerDay: 0.2, // LRO CRaTER lunar orbit, 1 Mar 2012 (RadLab)
    radiationGreenBelowMsv: 1.6,
    delaySeconds: { min: 1.3, max: 1.3, default: 1.3 },
    autonomy: 'Medium',
    autonomyNote: 'Near-real-time contact, but evacuation takes days.',
    hazardNote: 'No magnetosphere: higher galactic cosmic ray dose, 1/6 g, lunar dust in the habitat.',
  },
  rover: {
    id: 'rover',
    label: 'Rover (surface traverse)',
    qualityFactor: 3.0,
    measuredMGyPerDay: 0.2,
    radiationGreenBelowMsv: 1.6,
    delaySeconds: { min: 1.3, max: 1.3, default: 1.3 },
    autonomy: 'Medium',
    autonomyNote: 'Limited medical kit on board; know the route back to the base shelter.',
    hazardNote: 'Small pressurised cabin, thin shielding, long EVA days.',
  },
  marsTransit: {
    id: 'marsTransit',
    label: 'Mars transit',
    qualityFactor: 3.8,
    measuredMGyPerDay: 0.38, // Liulin-MO on ExoMars TGO, cruise to Mars, Apr–Sep 2016: mean of 4,326 readings (RadLab)
    radiationGreenBelowMsv: 1.9,
    delaySeconds: { min: 4 * 60, max: 20 * 60, default: 12 * 60 },
    autonomy: 'High',
    autonomyNote: 'Full self-treatment protocols: Earth replies take up to 40 minutes round-trip.',
    hazardNote: 'Deep space: highest radiation, months of isolation, no abort to Earth.',
  },
  marsSurface: {
    id: 'marsSurface',
    label: 'Mars surface base',
    qualityFactor: 3.0,
    measuredMGyPerDay: 0.1, // Curiosity RAD quiet days 14–19 May 2024 (RadLab)
    radiationGreenBelowMsv: 0.8,
    delaySeconds: { min: 4 * 60, max: 20 * 60, default: 12 * 60 },
    autonomy: 'High',
    autonomyNote: 'Full self-treatment protocols; crew medical officer leads care.',
    hazardNote: 'Thin atmosphere gives partial shielding; 0.38 g; dust storms and isolation.',
  },
};

export const ENVIRONMENT_IDS = Object.keys(ENVIRONMENTS);

/** Telemetry metrics accepted from wearables / gateways. */
export const TELEMETRY_METRICS = {
  hr: { label: 'Heart rate', unit: 'bpm' },
  sys: { label: 'Systolic BP', unit: 'mmHg' },
  dia: { label: 'Diastolic BP', unit: 'mmHg' },
  glucose: { label: 'Glucose', unit: 'mg/dL' },
  temp: { label: 'Body temperature', unit: '°C' },
  sleep: { label: 'Sleep (last night)', unit: 'h' },
  radiation: { label: 'Dosimeter (24 h)', unit: 'mGy/day' },
};
