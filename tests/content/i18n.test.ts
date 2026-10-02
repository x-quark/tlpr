import { describe, expect, it } from 'vitest';

import english from '../../src/_locales/en/messages.json';
import french from '../../src/_locales/fr/messages.json';

describe('interface translations', () => {
  it('keeps English and French message keys aligned', () => {
    expect(Object.keys(french).sort()).toEqual(Object.keys(english).sort());
  });

  it('provides count substitutions in both states and languages', () => {
    for (const messages of [english, french]) {
      for (const key of [
        'timelineHiddenOne',
        'timelineHiddenMany',
        'timelineShownOne',
        'timelineShownMany',
        'show',
      ] as const) {
        expect(messages[key].message).toContain('$COUNT$');
        expect(messages[key].placeholders.count.content).toBe('$1');
      }
    }
  });
});
