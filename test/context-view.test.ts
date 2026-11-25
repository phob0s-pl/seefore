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

test('a system with no context is not in the list, and a model with none gives nothing', () => {
  const read = context(SHOP, system('warehouse', 'name: Warehouse\n'));
  expect(read.systems.map((each) => each.id)).toEqual(['shop']);
  expect(read.system('warehouse')).toBeUndefined();
  expect(read.system('nobody')).toBeUndefined();
  expect(context(system('warehouse', 'name: Warehouse\n')).systems).toEqual([]);
  expect(context().systems).toEqual([]);
});

test('the team’s own systems stand first, by name, then the outside ones, by name', () => {
  const lines = 'context:\n  - must: A sentence.\n    why: A reason.\n';
  const read = context(
    system('post', `name: Post office\nexternal: true\n${lines}`),
    system('shop', `name: shop\n${lines}`),
    system('bank', `name: Bank\nexternal: true\n${lines}`),
    system('archive', `name: Archive\n${lines}`),
  );
  expect(read.systems.map((each) => [each.id, each.name, each.external])).toEqual([
    ['archive', 'Archive', false],
    ['shop', 'shop', false],
    ['bank', 'Bank', true],
    ['post', 'Post office', true],
  ]);
});

test('the lines that bind stand first, each kind in the order of the file, and each keeps its place in the file', () => {
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
  expect(read.system('shop')).toEqual({
    id: 'shop',
    name: 'Shop',
    external: false,
    lines: [
      { place: 2, kind: 'must', sentence: 'Data stays in the EU.', reason: 'The contracts require it.' },
      { place: 4, kind: 'must', sentence: 'Nothing is deployed before an on-sale.', reason: 'An on-sale is the busiest hour.' },
      { place: 1, kind: 'prefer', sentence: 'Speed first, then cost.', reason: 'The owner said so.' },
      { place: 3, kind: 'prefer', sentence: 'Work goes through a topic.', reason: 'Nothing waits.' },
    ],
  });
});

test('a line is found by its system and its place, and nothing is found where there is none', () => {
  const read = context(SHOP, system('bank', 'name: Bank\nexternal: true\ncontext:\n  - prefer: Another sentence.\n    why: Another reason.\n'));
  expect(read.line('shop', 1)).toEqual({ place: 1, kind: 'must', sentence: 'An order is never lost.', reason: 'The shop promises it.' });
  expect(read.line('shop', 2)).toMatchObject({ kind: 'prefer', sentence: 'A new feature goes into the API.' });
  expect(read.line('bank', 1)).toMatchObject({ kind: 'prefer', sentence: 'Another sentence.' });
  expect(read.line('shop', 3)).toBeUndefined();
  expect(read.line('shop', 0)).toBeUndefined();
  expect(read.line('nobody', 1)).toBeUndefined();
});

test('a line with neither key is left out and the others keep their places; one with no why has no reason', () => {
  // The check keeps such a file from the answer; the page reads what the answer gives all the same.
  const read = contextOf([
    record('shop', {
      name: 'Shop',
      context: [{ why: 'A reason with no sentence.' }, { must: '', why: 'An empty sentence.' }, { must: 'A sentence.' }, 'Keep it simple.', { prefer: 'Another.', why: 'Its reason.' }],
    }),
    record('bank', { name: 'Bank', context: [{ why: 'Nothing else.' }] }),
    record('post', { name: 'Post', context: 'Keep it simple.' }),
  ]);
  expect(read.system('shop')?.lines).toEqual([
    { place: 3, kind: 'must', sentence: 'A sentence.' },
    { place: 5, kind: 'prefer', sentence: 'Another.', reason: 'Its reason.' },
  ]);
  expect(read.systems.map((each) => each.id)).toEqual(['shop']);
});

test('the words of the count: each kind with its number, the one with none left out', () => {
  const lines = (must: number, prefer: number) => ({
    id: 'shop',
    name: 'Shop',
    external: false,
    lines: [
      ...Array.from({ length: must }, (_, at) => ({ place: at + 1, kind: 'must' as const, sentence: 'A.' })),
      ...Array.from({ length: prefer }, (_, at) => ({ place: must + at + 1, kind: 'prefer' as const, sentence: 'B.' })),
    ],
  });
  expect(countWords(lines(5, 2))).toBe('5 must · 2 prefer');
  expect(countWords(lines(1, 0))).toBe('1 must');
  expect(countWords(lines(0, 2))).toBe('2 prefer');
  const shop = context(SHOP).system('shop');
  expect(shop && countWords(shop)).toBe('1 must · 1 prefer');
});
