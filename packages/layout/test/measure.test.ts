import { describe, expect, it } from 'vitest';
import { ELLIPSIS, widthOf } from '../src/measure.ts';
import { ARIAL_BOLD, ARIAL_ELLIPSIS, ARIAL_REGULAR, TABLE_FIRST, TABLE_LAST } from '../src/widths.ts';

const REGULAR_12 = { size: 12, bold: false };
const BOLD_15 = { size: 15, bold: true };

describe('the table of widths', () => {
  it('has a width for every character from 32 to 255, regular and bold', () => {
    expect(TABLE_FIRST).toBe(32);
    expect(TABLE_LAST).toBe(255);
    expect(ARIAL_REGULAR).toHaveLength(224);
    expect(ARIAL_BOLD).toHaveLength(224);
  });

  it('holds the widths of Arial', () => {
    // Arial's own advance widths, in thousandths of the size.
    expect(ARIAL_REGULAR['i'.charCodeAt(0) - 32]).toBeCloseTo(222.17, 1);
    expect(ARIAL_BOLD['i'.charCodeAt(0) - 32]).toBeCloseTo(277.83, 1);
    expect(ARIAL_REGULAR[' '.charCodeAt(0) - 32]).toBeCloseTo(277.83, 1);
    expect(ARIAL_REGULAR['W'.charCodeAt(0) - 32]).toBeCloseTo(943.85, 1);
    expect(ARIAL_REGULAR['é'.charCodeAt(0) - 32]).toBeCloseTo(556.15, 1);
    expect(ARIAL_ELLIPSIS.regular).toBe(1000);
  });
});

describe('the width of a text', () => {
  it('is the sum of the widths of its characters at the size', () => {
    const widths = [...'Shop'].map((character) => ARIAL_REGULAR[character.charCodeAt(0) - 32] ?? 0);
    expect(widthOf('Shop', REGULAR_12)).toBeCloseTo((widths.reduce((sum, width) => sum + width, 0) * 12) / 1000, 6);
    expect(widthOf('', REGULAR_12)).toBe(0);
  });

  it('is larger in bold', () => {
    expect(widthOf('Order API', BOLD_15)).toBeGreaterThan(widthOf('Order API', { size: 15, bold: false }));
  });

  it('counts a letter with a mark joined to it as the letter alone', () => {
    expect(widthOf('é', REGULAR_12)).toBeCloseTo(widthOf('e', REGULAR_12), 6);
  });

  it('counts a sign outside the table as wide as the font is high', () => {
    expect(widthOf('Ω', REGULAR_12)).toBe(12);
    expect(widthOf('→', BOLD_15)).toBe(15);
  });

  it('counts an emoji as a third wider than the font is high, however many it is joined of', () => {
    expect(widthOf('🛒', REGULAR_12)).toBeCloseTo(16, 6);
    expect(widthOf('👨‍👩‍👧', REGULAR_12)).toBeCloseTo(16, 6);
    expect(widthOf('🇵🇱', REGULAR_12)).toBeCloseTo(16, 6);
    expect(widthOf('❤️', REGULAR_12)).toBeCloseTo(16, 6);
  });

  it('counts a Chinese, Japanese or Korean character as a third wider than the font is high', () => {
    expect(widthOf('订单', REGULAR_12)).toBeCloseTo(32, 6);
    expect(widthOf('カート', REGULAR_12)).toBeCloseTo(48, 6);
    expect(widthOf('주문', REGULAR_12)).toBeCloseTo(32, 6);
  });

  it('counts the ellipsis at its measured width', () => {
    expect(widthOf(ELLIPSIS, REGULAR_12)).toBe(12);
  });
});
