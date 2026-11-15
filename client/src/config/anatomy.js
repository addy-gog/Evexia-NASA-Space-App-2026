/**
 * The full-page body viewer: which 3D models to load, which layers each view shows,
 * which anatomy part answers to each reading, and where its marker sits.
 *
 * All positions are in metres in "viewer space": every model is scaled to 1.75 m tall,
 * feet on the floor, centred on x/z (see `fitToBody` in AnatomyViewer.jsx).
 * Numbers marked "measured" were read from the model files on 15 Nov 2026, not guessed.
 */

export const BODY_HEIGHT = 1.75;

/**
 * Outside: realistic bodies (CC BY 4.0). Inside: Open Anatomy 3D (CC BY 4.0 models).
 * Arm zone (measured): the outside model's outstretched arms. During the scan they fade
 * as one piece instead of being cut, because the anatomy model holds its arms down.
 */
export const BODY_MODELS = {
  male: {
    outer: '/models/outer-male.glb',
    anatomy: '/models/anatomy-male.glb',
    outerMB: 4.4,
    anatomyMB: 7.6,
    arms: { x: 0.21, top: 1.47, bottom: 0.9, fadeEnd: 1.2, torso: 0.21 },
  },
  female: {
    outer: '/models/outer-female.glb',
    anatomy: '/models/anatomy-female.glb',
    outerMB: 6.2,
    anatomyMB: 8.1,
    arms: { x: 0.19, top: 1.47, bottom: 0.76, fadeEnd: 1.2, torso: 0.19 },
  },
};

/** The crew record stores "Female" / "Male"; anything else uses the male models. */
export function bodyKindFor(sex) {
  return String(sex ?? '').toLowerCase().startsWith('f') ? 'female' : 'male';
}

/** Views, ordered from the outside in (the order itself says "going deeper"). */
export const VIEWS = [
  { id: 'outside', label: 'Outside', hint: 'The whole body' },
  { id: 'muscles', label: 'Muscles', hint: 'Muscles over the skeleton', layers: ['muscles', 'skeleton'] },
  { id: 'skeleton', label: 'Skeleton', hint: 'Bones only', layers: ['skeleton'] },
  { id: 'organs', label: 'Organs', hint: 'Organs, vessels and bones', layers: ['organs', 'vessels', 'skeleton'], faint: ['skeleton'] },
  { id: 'exploded', label: 'Exploded', hint: 'Parts pulled apart', layers: ['organs', 'vessels', 'skeleton'], faint: ['skeleton'] },
];
export const VIEW_BY_ID = Object.fromEntries(VIEWS.map((v) => [v.id, v]));
export const isInside = (viewId) => viewId !== 'outside';

/** Anatomy parts (Open Anatomy node names) that glow for each reading. */
export const PARTS_FOR = {
  hr: ['heart'],
  bp: ['carotid_l', 'carotid_r', 'aorta', 'coronary_arteries'],
  glucose: ['pancreas'],
  temp: [],
  sleep: ['brain'],
  radiation: ['pelvis', 'sternum', 'femur_l', 'femur_r'],
};

/** What each marker points at, in plain words. */
export const PART_NAMES = {
  hr: 'Heart',
  bp: 'Neck arteries and aorta',
  glucose: 'Pancreas',
  temp: 'Skin, taken at the armpit',
  sleep: 'Brain',
  radiation: 'Bone marrow (thighs, pelvis, sternum)',
};

/**
 * Marker anchors (measured from the anatomy models' part bounding boxes, scaled to 1.75 m).
 * At this size a 44 px tap area is about 0.14 m of body, so anchors sit at least that far apart:
 * - Blood pressure: right neck artery, not the aorta (on the aorta it covered the heart marker,
 *   found by the Body page browser test, 15 Nov 2026).
 * - Temperature: the armpit, where it is often taken (on the forehead it sat on the sleep marker).
 * - Radiation: the right thigh bone, a bone-marrow site (the pelvis centre landed on the groin).
 */
export const MARKERS = {
  male: { hr: [0.022, 1.328, 0.023], bp: [-0.023, 1.538, 0.005], glucose: [0.007, 1.141, 0.021], temp: [-0.145, 1.36, 0.02], sleep: [0.001, 1.679, -0.022], radiation: [-0.092, 0.72, 0] },
  female: { hr: [0.024, 1.304, 0.013], bp: [-0.02, 1.533, 0.014], glucose: [0.006, 1.16, 0.013], temp: [-0.145, 1.33, 0.02], sleep: [0, 1.688, -0.01], radiation: [-0.114, 0.72, 0] },
};
/** The part each marker rides with when the Exploded view pulls parts apart. */
export const MARKER_PART = { hr: 'heart', bp: 'carotid_r', glucose: 'pancreas', temp: 'humerus_r', sleep: 'brain', radiation: 'femur_r' };
/** Which side of its point each label sits on, so neighbouring labels do not collide. */
export const MARKER_SIDE = { hr: 'right', bp: 'left', glucose: 'right', temp: 'left', sleep: 'right', radiation: 'left' };

/** Minimum gap between marker anchors so 44 px tap areas never overlap (checked by a unit test). */
export const MIN_MARKER_GAP_M = 0.14;

/** Camera presets: angle around the body (radians). */
export const ORIENTATIONS = [
  { id: 'front', label: 'Front', azimuth: 0 },
  { id: 'side', label: 'Side', azimuth: Math.PI / 2 },
  { id: 'back', label: 'Back', azimuth: Math.PI },
];

/** Scan sweep timing (seconds) and band travel (metres, a little past head and feet). */
export const SCAN = { seconds: 1.6, top: 1.82, bottom: -0.08 };

/** Band height for progress p (0..1). Down when going inside, up when coming back out. Sine in-out. */
export function bandAt(p, direction) {
  const t = 0.5 - Math.cos(Math.PI * Math.min(1, Math.max(0, p))) / 2;
  const down = SCAN.top - t * (SCAN.top - SCAN.bottom);
  return direction === 'down' ? down : SCAN.bottom + t * (SCAN.top - SCAN.bottom);
}

/** Opacity of the outside model's arms for a band at height y (1 above the shoulders, 0 below fadeEnd). */
export function armOpacityAt(y, arms) {
  return Math.min(1, Math.max(0, (y - arms.fadeEnd) / (arms.top - arms.fadeEnd)));
}

export const MODEL_CREDITS = [
  { what: 'Outside body, male', title: 'James realistic male character 3D model', author: 'StormierTunic16', url: 'https://sketchfab.com/3d-models/james-realistic-male-character-3d-model-394c101990a54fa0adfc71d3d967fa2e', licence: 'CC BY 4.0', note: 'Textures reduced from 4096 to 2048 px.' },
  { what: 'Outside body, female', title: 'Stylized Female Character 3D Model', author: 'AhRabbi', url: 'https://sketchfab.com/3d-models/stylized-female-character-3d-model-b4b5163f852f445e9b2ad72c5f624f47', licence: 'CC BY 4.0' },
  { what: 'Anatomy (inside views)', title: 'Open Anatomy 3D', author: 'MervinR07', url: 'https://github.com/MervinR07/open-anatomy-3d', licence: 'Models CC BY 4.0, code MIT', note: 'Adapted from BodyParts3D (© The Database Center for Life Science, CC BY 4.0), the Human Reference Atlas 3D reference organs (HuBMAP, CC BY 4.0) and MakeHuman (CC0).' },
];
