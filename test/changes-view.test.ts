import { expect, test } from 'vitest';
import type { ModelRecord } from '../src/model/answer.ts';
import { changesOf } from '../src/model/changes.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = {
  path: 'seefore.yaml',
  text: 'format: 1\nname: Shop\n',
};
const SHOP: SourceFile = { path: 'systems/shop.yaml', text: 'name: Shop\n' };
const change = (id: string, text: string): SourceFile => ({
  path: `changes/${id}.yaml`,
  text,
});
/** The changes of a model of the files given. */
const changes = (...files: SourceFile[]) => changesOf(readModel([MARKER, SHOP, ...files]).records);
/** A record as the answer gives it, with fields the check would not let through. */
const record = (kind: string, id: string, fields: Record<string, unknown>): ModelRecord => ({ kind, id, file: `${kind}/${id}.yaml`, fields });

test('the changes stand by name, without regard to capitals, and one with no name of text after them under its id', () => {
  const read = changes(
    change('post', 'name: Orders by post\nprompt: Take orders by post.\n'),
    change('ledger', 'name: a ledger for settlement\nprompt: Move settlement onto a ledger.\nadd:\n  apps/ledger: {name: Ledger, in: shop}\n'),
    change('archive', 'name: Archive the old orders\nprompt: Keep the old orders apart.\n'),
  );
  expect(read.all).toEqual([
    { id: 'ledger', name: 'a ledger for settlement' },
    { id: 'archive', name: 'Archive the old orders' },
    { id: 'post', name: 'Orders by post' },
  ]);
  // The check tells a change with no name; the page shows it all the same, under its id.
  const faulty = changesOf([record('changes', 'zebra', { name: 'Zebra', prompt: 'A.' }), record('changes', 'nameless', { prompt: 'B.' }), record('changes', 'numbered', { name: 7, prompt: 'C.' })]);
  expect(faulty.all).toEqual([
    { id: 'zebra', name: 'Zebra' },
    { id: 'nameless', name: 'nameless' },
    { id: 'numbered', name: 'numbered' },
  ]);
});

test('a change is found by its id, also one that another record has, and another record is no change', () => {
  const read = changes(change('shop', 'name: A second shop\nprompt: Open a second shop.\n'), change('post', 'name: Orders by post\nprompt: Take orders by post.\n'));
  expect(read.change('post')).toEqual({ id: 'post', name: 'Orders by post' });
  // The change `shop` is read from `changes/`, not the system of that id.
  expect(read.change('shop')).toEqual({ id: 'shop', name: 'A second shop' });
  const without = changes(change('post', 'name: Orders by post\nprompt: Take orders by post.\n'));
  expect(without.change('shop')).toBeUndefined();
  expect(without.change('nobody')).toBeUndefined();
});

test('a model with no change has none, and finds none', () => {
  const read = changes();
  expect(read.all).toEqual([]);
  expect(read.change('shop')).toBeUndefined();
});
