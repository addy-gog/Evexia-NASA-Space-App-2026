import { describe, it, expect } from 'vitest';
import { BODY_MODELS, MARKERS, MARKER_PART, MIN_MARKER_GAP_M, PARTS_FOR, SCAN, VIEWS, armOpacityAt, bandAt, bodyKindFor } from '../src/config/anatomy.js';
import { ANATOMY_COLORS } from '../src/config/anatomyColors.js';
import { INDICATORS } from '../src/config/thresholds.js';

describe('body viewer config', () => {
  it('every reading has a marker on both bodies', () => {
    for (const kind of ['male', 'female']) {
      for (const m of INDICATORS) expect(MARKERS[kind][m.id], `${kind} ${m.id}`).toHaveLength(3);
    }
  });

  it('markers sit far enough apart that their 44 px tap areas never overlap (seen from the front)', () => {
    for (const kind of ['male', 'female']) {
      const entries = Object.entries(MARKERS[kind]);
      for (let i = 0; i < entries.length; i += 1) {
        for (let j = i + 1; j < entries.length; j += 1) {
          const [a, pa] = entries[i];
          const [b, pb] = entries[j];
          const gap = Math.hypot(pa[0] - pb[0], pa[1] - pb[1]);
          expect(gap, `${kind}: ${a} and ${b} are ${gap.toFixed(3)} m apart`).toBeGreaterThanOrEqual(MIN_MARKER_GAP_M);
        }
      }
    }
  });

  it('every part that glows or carries a marker exists in the anatomy model', () => {
    const parts = [...Object.values(PARTS_FOR).flat(), ...Object.values(MARKER_PART)];
    for (const p of parts) expect(ANATOMY_COLORS[p], p).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('views go from the outside in, and inside views name real layers', () => {
    expect(VIEWS.map((v) => v.id)).toEqual(['outside', 'muscles', 'skeleton', 'organs', 'exploded']);
    const layers = new Set(['skin', 'skeleton', 'muscles', 'organs', 'vessels', 'nerves', 'joints']);
    for (const v of VIEWS.filter((x) => x.id !== 'outside')) for (const l of v.layers) expect(layers.has(l), `${v.id}: ${l}`).toBe(true);
  });

  it('the scan band starts above the head and ends below the feet, both ways', () => {
    expect(bandAt(0, 'down')).toBeCloseTo(SCAN.top);
    expect(bandAt(1, 'down')).toBeCloseTo(SCAN.bottom);
    expect(bandAt(0, 'up')).toBeCloseTo(SCAN.bottom);
    expect(bandAt(1, 'up')).toBeCloseTo(SCAN.top);
    expect(bandAt(0.5, 'down')).toBeCloseTo((SCAN.top + SCAN.bottom) / 2);
  });

  it('outside arms are fully there above the shoulders and gone below the fade line', () => {
    const arms = BODY_MODELS.male.arms;
    expect(armOpacityAt(1.6, arms)).toBe(1);
    expect(armOpacityAt(arms.fadeEnd - 0.01, arms)).toBe(0);
    expect(armOpacityAt((arms.top + arms.fadeEnd) / 2, arms)).toBeCloseTo(0.5);
  });

  it('crew sex picks the matching models', () => {
    expect(bodyKindFor('Female')).toBe('female');
    expect(bodyKindFor('Male')).toBe('male');
    expect(bodyKindFor(undefined)).toBe('male');
  });
});
