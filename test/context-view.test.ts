import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { contextOf, countWords } from '../src/model/context.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' };
const system = (id: string, text: string): SourceFile => ({ path: `systems/${id}.yaml`, text });
/** The context of a model of the systems given. */
const context = (...files: SourceFile[]) => contextOf(readModel([MARKER, ...files]).records);
/** A system's record as the answer gives it, with fields the check would not let through. */
const record = (id: string, fields: Record<string, unknown>): ModelRecord => ({ kind: 'systems', id, file: `systems/${id}.yaml`, fields });

const SHOP = system('shop', 'name: Shop\ncontext:\n  - must: An order is never lost.\n    why: The shop promises it.\n  - prefer: A new feature goes into the API.\n    why: One team runs it.\n');

test('a system with no context gives no band, and a model with none gives nothing', () => {
  const read = context(SHOP, system('warehouse', 'name: Warehouse\n'));
  expect(read.bands.map((band) => band.id)).toEqual(['shop']);
  expect(read.band('warehouse')).toBeUndefined();
  expect(read.band('nobody')).toBeUndefined();
  expect(context(system('warehouse', 'name: Warehouse\n')).bands).toEqual([]);
  expect(context().bands).toEqual([]);
});

test('the team’s own systems stand first, by name, then the outside ones, by name', () => {
  const lines = 'context:\n  - must: A sentence.\n    why: A reason.\n';
  const read = context(
    system('post', `name: Post office\nexternal: true\n${lines}`),
    system('shop', `name: shop\n${lines}`),
    system('bank', `name: Bank\nexternal: true\n${lines}`),
    system('archive', `name: Archive\n${lines}`),
  );
  expect(read.bands.map((band) => [band.id, band.name, band.external])).toEqual([
    ['archive', 'Archive', false],
    ['shop', 'shop', false],
    ['bank', 'Bank', true],
    ['post', 'Post office', true],
  ]);
});

test('each line goes to its kind in the order of the file, and a prefer written first stays first', () => {
  const read = context(
    system(
      'shop',
      [
        'name: Shop',
        'context:',
        '  - prefer: Speed first, then cost.',
        '    why: The owner said so.',
        '  - must: Data stays in the EU.',
        '    why: The contracts require it.',
        '  - prefer: Work goes through a topic.',
        '    why: Nothing waits.',
        '  - must: Nothing is deployed before an on-sale.',
        '    why: An on-sale is the busiest hour.',
        '',
      ].join('\n'),
    ),
  );
  expect(read.band('shop')).toEqual({
    id: 'shop',
    name: 'Shop',
    external: false,
    must: [
      { sentence: 'Data stays in the EU.', reason: 'The contracts require it.' },
      { sentence: 'Nothing is deployed before an on-sale.', reason: 'An on-sale is the busiest hour.' },
    ],
    prefer: [
      { sentence: 'Speed first, then cost.', reason: 'The owner said so.' },
      { sentence: 'Work goes through a topic.', reason: 'Nothing waits.' },
    ],
  });
});

test('a system with lines of one kind has nothing under the other', () => {
  const read = context(
    system('shop', 'name: Shop\ncontext:\n  - must: A sentence.\n    why: A reason.\n'),
    system('bank', 'name: Bank\nexternal: true\ncontext:\n  - prefer: Another sentence.\n    why: Another reason.\n'),
  );
  expect(read.band('shop')).toMatchObject({ must: [{ sentence: 'A sentence.' }], prefer: [] });
  expect(read.band('bank')).toMatchObject({ must: [], prefer: [{ sentence: 'Another sentence.' }] });
});

test('a line with neither key is left out and the others stand; one with no why shows its sentence alone', () => {
  // The check keeps such a file from the answer; the page reads what the answer gives all the same.
  const read = contextOf([
    record('shop', {
      name: 'Shop',
      context: [{ why: 'A reason with no sentence.' }, { must: '', why: 'An empty sentence.' }, { must: 'A sentence.' }, 'Keep it simple.', { prefer: 'Another.', why: 'Its reason.' }],
    }),
    record('bank', { name: 'Bank', context: [{ why: 'Nothing else.' }] }),
    record('post', { name: 'Post', context: 'Keep it simple.' }),
  ]);
  expect(read.band('shop')).toEqual({ id: 'shop', name: 'Shop', external: false, must: [{ sentence: 'A sentence.' }], prefer: [{ sentence: 'Another.', reason: 'Its reason.' }] });
  expect(read.bands.map((band) => band.id)).toEqual(['shop']);
});

test('the words of the count: each kind with its number, the one with none left out', () => {
  const band = (must: number, prefer: number) => ({
    id: 'shop',
    name: 'Shop',
    external: false,
    must: Array.from({ length: must }, () => ({ sentence: 'A.' })),
    prefer: Array.from({ length: prefer }, () => ({ sentence: 'B.' })),
  });
  expect(countWords(band(5, 2))).toBe('5 must · 2 prefer');
  expect(countWords(band(1, 0))).toBe('1 must');
  expect(countWords(band(0, 2))).toBe('2 prefer');
  const shop = context(SHOP).band('shop');
  expect(shop && countWords(shop)).toBe('1 must · 1 prefer');
});
