import { describe, expect, it } from 'vitest';
import { flat, linesOf, oneLine } from '../src/lines.ts';
import { ELLIPSIS, graphemesOf, widthOf } from '../src/measure.ts';
import type { Font } from '../src/measure.ts';

const NAME: Font = { size: 15, bold: true };
const SENTENCE: Font = { size: 12, bold: false };
const WIDTH = 216;

/** True when no line is wider than the width, allowing for the sum of fractions. */
function fit(lines: readonly string[], font: Font, width: number): boolean {
  return lines.every((line) => widthOf(line, font) <= width + 1e-9);
}

const LONG_SENTENCE =
  'Takes orders from the storefront and from the mobile apps, checks each against the stock and the customer’s account, keeps how far each has got, and tells the warehouse, the card provider and the customer whenever anything about it changes.';

describe('a text in one line', () => {
  it('is its words with one space between them and none at either end', () => {
    expect(flat('  Takes\n orders\t and   more  ')).toBe('Takes orders and more');
  });

  it('stays whole when it fits', () => {
    expect(oneLine('[App: service · Go]', SENTENCE, WIDTH)).toBe('[App: service · Go]');
  });

  it('is cut with an ellipsis after the words that fit', () => {
    const line = oneLine('[App: service · Go, PostgreSQL, Redis, Kafka, RabbitMQ, Elasticsearch]', SENTENCE, WIDTH);
    expect(line.endsWith(ELLIPSIS)).toBe(true);
    expect(fit([line], SENTENCE, WIDTH)).toBe(true);
    expect('[App: service · Go, PostgreSQL, Redis, Kafka, RabbitMQ, Elasticsearch]'.startsWith(line.slice(0, -1))).toBe(true);
    expect(line.at(-2)).not.toBe(' ');
  });

  it('of two words that only fits when cut keeps the first and the ellipsis', () => {
    expect(oneLine('Supercalifragilistic Expialidocious', NAME, WIDTH)).toBe(`Supercalifragilistic${ELLIPSIS}`);
  });

  it('cuts inside a word when not even the first word fits', () => {
    const line = oneLine('Internationalisationconfigurationmanager', NAME, WIDTH);
    expect(line.endsWith(ELLIPSIS)).toBe(true);
    expect(fit([line], NAME, WIDTH)).toBe(true);
    expect(widthOf(line, NAME)).toBeGreaterThan(WIDTH - widthOf('W', NAME) - 1);
  });

  it('is empty for an empty text', () => {
    expect(oneLine('   ', SENTENCE, WIDTH)).toBe('');
  });
});

describe('a text in lines', () => {
  it('has no lines when it is empty', () => {
    expect(linesOf('', SENTENCE, WIDTH, 4)).toEqual([]);
    expect(linesOf(' \n ', SENTENCE, WIDTH, 4)).toEqual([]);
  });

  it('is one line when it fits', () => {
    expect(linesOf('Every order and how far it has got.', SENTENCE, WIDTH, 4)).toEqual(['Every order and how far it has got.']);
  });

  it('breaks at spaces, each line as full as it can be', () => {
    const lines = linesOf('Tells the warehouse what to pack and records what was sent.', SENTENCE, WIDTH, 4);
    expect(lines).toEqual(['Tells the warehouse what to pack and', 'records what was sent.']);
    expect(fit(lines, SENTENCE, WIDTH)).toBe(true);
    // The first word of each line would not have fitted on the line before it.
    for (const [at, line] of lines.slice(1).entries()) {
      expect(widthOf(`${lines[at]} ${line.split(' ')[0]}`, SENTENCE)).toBeGreaterThan(WIDTH);
    }
  });

  it('ends the last line with an ellipsis after the words that fit when the text needs more lines', () => {
    const lines = linesOf(LONG_SENTENCE, SENTENCE, WIDTH, 4);
    expect(lines).toHaveLength(4);
    expect(fit(lines, SENTENCE, WIDTH)).toBe(true);
    const last = lines[3] ?? '';
    expect(last.endsWith(ELLIPSIS)).toBe(true);
    expect(last.at(-2)).not.toBe(' ');
    expect(lines.slice(0, 3).every((line) => !line.includes(ELLIPSIS))).toBe(true);
    // What is shown is the start of the text, word for word.
    expect(LONG_SENTENCE.startsWith(lines.join(' ').slice(0, -1))).toBe(true);
    // The word after the cut is whole or missing, never cut in half.
    const shown = last.slice(0, -1).split(' ');
    expect(LONG_SENTENCE.split(' ')).toContain(shown.at(-1));
  });

  it('breaks a name of 30 letters with no space inside the word, with nothing cut', () => {
    const name = 'Abcdefghijklmnopqrstuvwxyzabcd';
    const lines = linesOf(name, NAME, WIDTH, 2);
    expect(lines).toHaveLength(2);
    expect(lines.join('')).toBe(name);
    expect(fit(lines, NAME, WIDTH)).toBe(true);
  });

  it('breaks inside a word only when the word alone is wider than the line', () => {
    const lines = linesOf('Ab Abcdefghijklmnopqrstuvwxyzabcd', NAME, WIDTH, 3);
    expect(lines[0]).toBe('Ab');
    expect(lines.slice(1).join('')).toBe('Abcdefghijklmnopqrstuvwxyzabcd');
  });

  it('goes on after a broken word on its last line', () => {
    const lines = linesOf('Abcdefghijklmnopqrstuvwxyzabcd and more', NAME, WIDTH, 3);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith(' and more')).toBe(true);
  });

  it('of two words that only fits when cut is cut, each line still fitting', () => {
    const name = 'Internationalisationsconfigurationsmanager Configurationsdatabase';
    const lines = linesOf(name, NAME, WIDTH, 2);
    expect(lines).toHaveLength(2);
    expect(lines[1]?.endsWith(ELLIPSIS)).toBe(true);
    expect(fit(lines, NAME, WIDTH)).toBe(true);
    expect(name.startsWith(lines.join('').slice(0, -1))).toBe(true);
  });

  it('never breaks inside a character as a reader sees it', () => {
    const family = '👨‍👩‍👧';
    const flags = '🇵🇱🇬🇧';
    for (const text of [family.repeat(20), `${flags.repeat(10)} ${family.repeat(5)}`, 'é'.repeat(60)]) {
      const lines = linesOf(text, SENTENCE, WIDTH, 2);
      expect(lines.length).toBeGreaterThan(0);
      expect(fit(lines, SENTENCE, WIDTH)).toBe(true);
      const whole = new Set(graphemesOf(text));
      for (const line of lines) for (const grapheme of graphemesOf(line)) expect(whole.has(grapheme) || grapheme === ELLIPSIS || grapheme === ' ').toBe(true);
    }
  });

  it('breaks a name in Chinese, which writes no spaces, between its characters, and keeps an emoji whole', () => {
    const name = '订单服务与库存同步中心 🛒 Order and stock service';
    const lines = linesOf(name, NAME, WIDTH, 2);
    expect(lines).toEqual(['订单服务与库存同步中', `心 🛒 Order and stock${ELLIPSIS}`]);
    expect(fit(lines, NAME, WIDTH)).toBe(true);
  });

  it('gives a character wider than the line a line of its own', () => {
    expect(linesOf('🛒🛒', { size: 30, bold: false }, 30, 3)).toEqual(['🛒', '🛒']);
  });
});
