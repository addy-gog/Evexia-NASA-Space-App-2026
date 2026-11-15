import { describe, it, expect } from 'vitest';
import { screenDangerSigns } from '../src/lib/safety.js';

const ids = (t) => screenDangerSigns(t).map((s) => s.id);

describe('safety screen (step 1 of the ladder)', () => {
  it('flags each danger sign in plain words', () => {
    expect(ids('my chest pain started an hour ago')).toEqual(['chest_pain']);
    expect(ids("I can't breathe")).toEqual(['breathing']);
    expect(ids('I am short of breath')).toEqual(['breathing']);
    expect(ids('Sam passed out in the galley')).toEqual(['fainting']);
    expect(ids('she had a seizure')).toEqual(['seizure']);
    expect(ids('he seems confused and slurred speech')).toEqual(['confusion', 'stroke']);
    expect(ids('my lips are swelling')).toEqual(['allergy']);
    expect(ids('his lips are turning blue')).toEqual(['blue']);
    expect(ids('the worst headache of my life')).toEqual(['headache']);
    expect(ids('I want to die')).toEqual(['self_harm']);
    expect(ids('the cut won\'t stop bleeding')).toEqual(['bleeding']);
  });
  it('ignores negated signs and ordinary questions', () => {
    expect(ids('no chest pain, just tired')).toEqual([]);
    expect(ids('I have not fainted')).toEqual([]);
    expect(ids('Is my radiation normal for Mars transit?')).toEqual([]);
    expect(ids('red itchy patch on my arm')).toEqual([]);
    expect(ids('')).toEqual([]);
  });
  it('still flags a sign that appears after a negated one', () => {
    expect(ids('no chest pain but I passed out')).toEqual(['fainting']);
  });
});
