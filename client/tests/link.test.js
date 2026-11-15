import { describe, it, expect } from 'vitest';
import { JOURNEY, reachedIndex, stepSentence } from '../src/lib/linkSteps.js';

describe('Earth link steps and journey', () => {
  it('has 5 customer-visible journey checkpoints', () => {
    expect(JOURNEY).toHaveLength(5);
    expect(JOURNEY.map((s) => s.id)).toEqual(['saved', 'sent', 'arrived', 'read', 'replied']);
  });

  it('maps raw link steps to journey indices correctly', () => {
    expect(reachedIndex('waiting')).toBe(0);
    expect(reachedIndex('saved')).toBe(0);
    expect(reachedIndex('sending')).toBe(0);
    expect(reachedIndex('sent')).toBe(1);
    expect(reachedIndex('arrived')).toBe(2);
    expect(reachedIndex('read')).toBe(3);
    expect(reachedIndex('replied')).toBe(4);
    expect(reachedIndex('unknown')).toBe(0);
  });

  it('returns plain-language descriptions for each stage', () => {
    expect(stepSentence('waiting', '12 min')).toContain('Waiting on board');
    expect(stepSentence('saved', '12 min')).toContain('Leaving now');
    expect(stepSentence('sent', '12 min')).toContain('On its way. It takes about 12 min');
    expect(stepSentence('arrived', '12 min')).toContain('Arrived on Earth');
    expect(stepSentence('read', '12 min')).toContain('flight surgeon has read it');
    expect(stepSentence('replied', '12 min')).toContain('flight surgeon replied');
    expect(stepSentence('other', '12 min')).toBe('');
  });
});
