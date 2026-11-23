import { describe, expect, it } from 'vitest';
import { DARK, LIGHT, contrast, themeCss } from '../src/theme.ts';
import type { Colours } from '../src/theme.ts';

/** The colours hold the contrast rule of WCAG 2.2 on the ground they are drawn on, in both themes, also faded. */

/** WCAG 2.2: text needs 4.5 to 1. */
const TEXT = 4.5;

/** WCAG 2.2: a line that tells what something is needs 3 to 1. */
const LINE = 3;

type Name = keyof Colours;

/**
 * Each colour, the grounds it is drawn on, and the ratio it needs there. A box, a label and the
 * legend are drawn on the ground; the boundary's title, its line and the arrows inside it on
 * its tint; the sidebar and the panel on their own ground.
 */
const RULES: [Name, Name[], number][] = [
  ['text', ['ground', 'tint', 'side'], TEXT],
  ['quiet', ['ground', 'side'], TEXT],
  ['fadedText', ['ground', 'tint'], TEXT],
  ['accent', ['ground', 'tint', 'side'], TEXT],
  ['error', ['side'], TEXT],
  ['person', ['ground', 'tint'], LINE],
  ['app', ['ground', 'tint'], LINE],
  ['store', ['ground', 'tint'], LINE],
  ['infrastructure', ['ground', 'tint'], LINE],
  ['system', ['ground', 'tint'], LINE],
  ['arrow', ['ground', 'tint'], LINE],
  ['fadedLine', ['ground', 'tint'], LINE],
  ['dimLine', ['ground', 'tint'], LINE],
  ['boundary', ['tint'], LINE],
];

/** The colours of a theme that fall short of the rule, as `name on ground`. None when all hold. */
function shortOf(colours: Colours): string[] {
  return RULES.flatMap(([name, grounds, needs]) => grounds.filter((ground) => contrast(colours[name], colours[ground]) < needs).map((ground) => `${name} on ${ground}`));
}

describe('the contrast of the colours', () => {
  it('meets the rule in the light theme, faded colours too', () => {
    expect(shortOf(LIGHT)).toEqual([]);
  });

  it('meets the rule in the dark theme, faded colours too', () => {
    expect(shortOf(DARK)).toEqual([]);
  });

  it('would find a colour that falls short', () => {
    expect(shortOf({ ...LIGHT, fadedText: '#999999' })).toEqual(['fadedText on ground', 'fadedText on tint']);
  });

  it('fades text and lines to colours that differ from the unfaded ones', () => {
    for (const colours of [LIGHT, DARK]) {
      expect(colours.fadedText).not.toBe(colours.text);
      expect(colours.fadedLine).not.toBe(colours.arrow);
    }
  });

  it('fades lines further below the zoom at which names are drawn, and still within the rule', () => {
    for (const colours of [LIGHT, DARK]) {
      for (const ground of [colours.ground, colours.tint]) expect(contrast(colours.dimLine, ground)).toBeLessThan(contrast(colours.fadedLine, ground));
    }
  });

  it('computes ratios as WCAG does', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 5);
    expect(contrast('#ffffff', '#ffffff')).toBe(1);
    expect(contrast('#ffffff', '#1d2633')).toBeCloseTo(15.25, 2);
    expect(contrast('#555555', '#f6f8fb')).toBeCloseTo(7.01, 2);
  });
});

describe('the style sheet of the tokens', () => {
  it('sets the light tokens, and the dark ones when the reader asks for them', () => {
    const css = themeCss();
    expect(css).toContain('--faded-text: #707070;');
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ :root \{[^}]*--ground: #14171c;/);
    expect(css).toContain('--font: Arial, Helvetica, "Liberation Sans", sans-serif;');
    expect(css).toContain('--size-name: 15px;');
  });
});
