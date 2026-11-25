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

const SHOP = system('system-shop', 'name: Shop\n');
const BANK = system('system-bank', 'name: Bank\nexternal: true\n');

test('a line that names no system is global, and one that names a system stands with that system', () => {
  const read = context(
    SHOP,
    BANK,
    line('context-orders-are-kept', 'must: An order is never lost.\nwhy: The shop promises it.\n'),
    line('context-bank-sets-the-format', 'must: The bank sets the format of a payment file.\nwhy: Its contract.\nsystem: system-bank\n'),
  );
  expect(read.global).toEqual([
    {
      id: 'context-orders-are-kept',
      kind: 'must',
      sentence: 'An order is never lost.',
      reason: 'The shop promises it.',
    },
  ]);
  expect(read.systems).toEqual([
    {
      id: 'system-bank',
      name: 'Bank',
      external: true,
      known: true,
      lines: [
        {
          id: 'context-bank-sets-the-format',
          kind: 'must',
          sentence: 'The bank sets the format of a payment file.',
          reason: 'Its contract.',
          system: 'system-bank',
        },
      ],
    },
  ]);
  // A system that no line names has no group, and a model with no line gives nothing.
  expect(read.system('system-shop')).toBeUndefined();
  expect(context(SHOP)).toMatchObject({ global: [], systems: [] });
});

test('the team’s own systems stand first, by name, then the outside ones, by name', () => {
  const about = (id: string) => line(`context-of-${id}`, `must: A sentence of ${id}.\nwhy: A reason.\nsystem: ${id}\n`);
  const read = context(
    system('system-post', 'name: Post office\nexternal: true\n'),
    system('system-shop', 'name: shop\n'),
    BANK,
    system('system-archive', 'name: Archive\n'),
    system('system-quiet', 'name: Quiet\n'),
    ...['system-post', 'system-shop', 'system-bank', 'system-archive'].map(about),
  );
  expect(read.systems.map((each) => [each.id, each.name, each.external])).toEqual([
    ['system-archive', 'Archive', false],
    ['system-shop', 'shop', false],
    ['system-bank', 'Bank', true],
    ['system-post', 'Post office', true],
  ]);
});

test('in a group the lines that bind stand first, each kind by its sentence', () => {
  const read = context(
    SHOP,
    line('context-a', 'prefer: Speed first, then cost.\nwhy: The owner said so.\n'),
    line('context-b', 'must: Nothing is deployed before an on-sale.\nwhy: An on-sale is the busiest hour.\n'),
    line('context-c', 'prefer: A new store is a PostgreSQL database.\nwhy: One kind to run.\n'),
    line('context-d', 'must: Data stays in the EU.\nwhy: The contracts require it.\n'),
    line('context-e', 'prefer: Work goes through a topic.\nwhy: Nothing waits.\nsystem: system-shop\n'),
    line('context-f', 'must: An order is never lost.\nwhy: The promise.\nsystem: system-shop\n'),
  );
  expect(read.global.map((each) => [each.kind, each.sentence])).toEqual([
    ['must', 'Data stays in the EU.'],
    ['must', 'Nothing is deployed before an on-sale.'],
    ['prefer', 'A new store is a PostgreSQL database.'],
    ['prefer', 'Speed first, then cost.'],
  ]);
  expect(read.system('system-shop')?.lines.map((each) => each.id)).toEqual(['context-f', 'context-e']);
});

test('a line is found by its id, with the other lines of its group beside it', () => {
  const read = context(
    SHOP,
    line('context-kept', 'must: An order is never lost.\nwhy: The promise.\n'),
    line('context-eu', 'must: Data stays in the EU.\nwhy: The contracts.\n'),
    line('context-topic', 'prefer: Work goes through a topic.\nwhy: Nothing waits.\nsystem: system-shop\n'),
  );
  const kept = read.line('context-kept');
  const topic = read.line('context-topic');
  expect(kept).toEqual({
    id: 'context-kept',
    kind: 'must',
    sentence: 'An order is never lost.',
    reason: 'The promise.',
  });
  expect(kept && read.beside(kept).map((each) => each.id)).toEqual(['context-eu']);
  expect(topic && read.beside(topic)).toEqual([]);
  expect(read.line('system-shop')).toBeUndefined();
  expect(read.line('context-nobody')).toBeUndefined();
});

test('a line whose system names no system stands under the id as written; one with neither key is left out', () => {
  // The check tells these faults; the page reads what the answer gives all the same.
  const read = contextOf([
    record('systems', 'system-shop', { name: 'Shop' }),
    record('apps', 'app-api', { name: 'API', in: 'system-shop' }),
    record('context', 'context-gone', {
      must: 'A sentence.',
      why: 'A reason.',
      system: 'system-warehouse',
    }),
    record('context', 'context-of-an-app', { prefer: 'Another.', system: 'app-api' }),
    record('context', 'context-empty', { why: 'A reason with no sentence.' }),
    record('context', 'context-blank', { must: '', why: 'An empty sentence.' }),
  ]);
  expect(read.global).toEqual([]);
  expect(read.systems.map((each) => [each.id, each.name, each.known, each.lines.map((line) => line.id)])).toEqual([
    ['app-api', 'app-api', false, ['context-of-an-app']],
    ['system-warehouse', 'system-warehouse', false, ['context-gone']],
  ]);
  expect(read.line('context-of-an-app')).toEqual({
    id: 'context-of-an-app',
    kind: 'prefer',
    sentence: 'Another.',
    system: 'app-api',
  });
  expect(read.line('context-empty')).toBeUndefined();
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
