import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { contextOf, countWords } from '../src/model/context.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = {
  path: 'seefore.yaml',
  text: 'format: 1\nname: Shop\n',
};
const system = (id: string, text: string): SourceFile => ({
  path: `systems/${id}.yaml`,
  text,
});
const line = (id: string, text: string): SourceFile => ({
  path: `context/${id}.yaml`,
  text,
});
/** The context of a model of the files given. */
const context = (...files: SourceFile[]) => contextOf(readModel([MARKER, ...files]).records);
/** A record as the answer gives it, with fields the check would not let through. */
const record = (kind: string, id: string, fields: Record<string, unknown>): ModelRecord => ({ kind, id, file: `${kind}/${id}.yaml`, fields });

const SHOP = system('shop', 'name: Shop\n');
const BANK = system('bank', 'name: Bank\nexternal: true\n');

test('a line that names no system is global, and one that names a system stands with that system', () => {
  const read = context(
    SHOP,
    BANK,
    line('orders-are-kept', 'must: An order is never lost.\nwhy: The shop promises it.\n'),
    line('bank-sets-the-format', 'must: The bank sets the format of a payment file.\nwhy: Its contract.\nsystem: bank\n'),
  );
  expect(read.global).toEqual([
    {
      id: 'orders-are-kept',
      kind: 'must',
      sentence: 'An order is never lost.',
      reason: 'The shop promises it.',
    },
  ]);
  expect(read.systems).toEqual([
    {
      id: 'bank',
      name: 'Bank',
      external: true,
      known: true,
      lines: [
        {
          id: 'bank-sets-the-format',
          kind: 'must',
          sentence: 'The bank sets the format of a payment file.',
          reason: 'Its contract.',
          system: 'bank',
        },
      ],
    },
  ]);
  // A system that no line names has no group, and a model with no line gives nothing.
  expect(read.system('shop')).toBeUndefined();
  expect(context(SHOP)).toMatchObject({ global: [], systems: [] });
});

test('the team’s own systems stand first, by name, then the outside ones, by name', () => {
  const about = (id: string) => line(`of-${id}`, `must: A sentence of ${id}.\nwhy: A reason.\nsystem: ${id}\n`);
  const read = context(
    system('post', 'name: Post office\nexternal: true\n'),
    system('shop', 'name: shop\n'),
    BANK,
    system('archive', 'name: Archive\n'),
    system('quiet', 'name: Quiet\n'),
    ...['post', 'shop', 'bank', 'archive'].map(about),
  );
  expect(read.systems.map((each) => [each.id, each.name, each.external])).toEqual([
    ['archive', 'Archive', false],
    ['shop', 'shop', false],
    ['bank', 'Bank', true],
    ['post', 'Post office', true],
  ]);
});

test('in a group the lines that bind stand first, each kind by its sentence', () => {
  const read = context(
    SHOP,
    line('a', 'prefer: Speed first, then cost.\nwhy: The owner said so.\n'),
    line('b', 'must: Nothing is deployed before an on-sale.\nwhy: An on-sale is the busiest hour.\n'),
    line('c', 'prefer: A new store is a PostgreSQL database.\nwhy: One kind to run.\n'),
    line('d', 'must: Data stays in the EU.\nwhy: The contracts require it.\n'),
    line('e', 'prefer: Work goes through a topic.\nwhy: Nothing waits.\nsystem: shop\n'),
    line('f', 'must: An order is never lost.\nwhy: The promise.\nsystem: shop\n'),
  );
  expect(read.global.map((each) => [each.kind, each.sentence])).toEqual([
    ['must', 'Data stays in the EU.'],
    ['must', 'Nothing is deployed before an on-sale.'],
    ['prefer', 'A new store is a PostgreSQL database.'],
    ['prefer', 'Speed first, then cost.'],
  ]);
  expect(read.system('shop')?.lines.map((each) => each.id)).toEqual(['f', 'e']);
});

test('a line is found by its id, with the other lines of its group beside it', () => {
  const read = context(
    SHOP,
    line('kept', 'must: An order is never lost.\nwhy: The promise.\n'),
    line('eu', 'must: Data stays in the EU.\nwhy: The contracts.\n'),
    line('topic', 'prefer: Work goes through a topic.\nwhy: Nothing waits.\nsystem: shop\n'),
  );
  const kept = read.line('kept');
  const topic = read.line('topic');
  expect(kept).toEqual({
    id: 'kept',
    kind: 'must',
    sentence: 'An order is never lost.',
    reason: 'The promise.',
  });
  expect(kept && read.beside(kept).map((each) => each.id)).toEqual(['eu']);
  expect(topic && read.beside(topic)).toEqual([]);
  expect(read.line('shop')).toBeUndefined();
  expect(read.line('nobody')).toBeUndefined();
});

test('a line whose system names no system stands under the id as written; one with neither key is left out', () => {
  // The check tells these faults; the page reads what the answer gives all the same.
  const read = contextOf([
    record('systems', 'shop', { name: 'Shop' }),
    record('apps', 'api', { name: 'API', in: 'shop' }),
    record('context', 'gone', {
      must: 'A sentence.',
      why: 'A reason.',
      system: 'warehouse',
    }),
    record('context', 'of-an-app', { prefer: 'Another.', system: 'api' }),
    record('context', 'empty', { why: 'A reason with no sentence.' }),
    record('context', 'blank', { must: '', why: 'An empty sentence.' }),
  ]);
  expect(read.global).toEqual([]);
  expect(read.systems.map((each) => [each.id, each.name, each.known, each.lines.map((line) => line.id)])).toEqual([
    ['api', 'api', false, ['of-an-app']],
    ['warehouse', 'warehouse', false, ['gone']],
  ]);
  expect(read.line('of-an-app')).toEqual({
    id: 'of-an-app',
    kind: 'prefer',
    sentence: 'Another.',
    system: 'api',
  });
  expect(read.line('empty')).toBeUndefined();
});

test('the words of a count: each kind with its number, the one with none left out', () => {
  const lines = (must: number, prefer: number) => [
    ...Array.from({ length: must }, (_, at) => ({
      id: `m${at}`,
      kind: 'must' as const,
      sentence: 'A.',
    })),
    ...Array.from({ length: prefer }, (_, at) => ({
      id: `p${at}`,
      kind: 'prefer' as const,
      sentence: 'B.',
    })),
  ];
  expect(countWords(lines(5, 2))).toBe('5 must · 2 prefer');
  expect(countWords(lines(1, 0))).toBe('1 must');
  expect(countWords(lines(0, 2))).toBe('2 prefer');
});
