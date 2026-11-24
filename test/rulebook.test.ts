import { expect, test } from 'vitest';
import type { Ruling } from '../src/model/answer.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { dotOf, rulebookOf, selectorLines, thingsOf, whereWords, writtenOf } from '../src/model/rulebook.ts';

/** A shop of Sales with a gateway, an outside bank and a clerk; the worker is there only at night. */
const BASE: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'owners/sales.yaml', text: 'name: Sales\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\nowner: sales\n' },
  { path: 'systems/bank.yaml', text: 'name: Bank\nexternal: true\n' },
  { path: 'apps/api.yaml', text: 'name: API\nin: shop\nkind: service\n' },
  { path: 'apps/web.yaml', text: 'name: Web\nin: shop\nkind: browser\n' },
  { path: 'apps/worker.yaml', text: 'name: Worker\nin: shop\nonly: when the night runs\n' },
  { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\nkind: database\n' },
  { path: 'infrastructure/gateway.yaml', text: 'name: Gateway\nin: shop\n' },
  { path: 'people/clerk.yaml', text: 'name: Clerk\n' },
  { path: 'connections/clerk-uses-web.yaml', text: 'from: clerk\nto: web\n' },
  { path: 'connections/web-calls-api.yaml', text: 'from: web\nto: api\nvia: [gateway]\n' },
  { path: 'connections/api-writes-orders.yaml', text: 'from: api\nto: orders\naccess: write\n' },
  { path: 'connections/worker-writes-orders.yaml', text: 'from: worker\nto: orders\naccess: write\n' },
];

const file = (path: string, text: string): SourceFile => ({ path, text });
const rule = (id: string, text: string): SourceFile => file(`rules/${id}.yaml`, text);
const book = (...files: SourceFile[]) => rulebookOf(readModel([...BASE, ...files]));

const ONLY_API = 'name: Only the API writes orders\neach: {to: {id: orders}, access: [write, read-write]}\nmust: {from: {id: api}}\n';
const ALWAYS_THERE = rule('always-there', 'name: Everything in the shop is always there\nnever: {within: shop, only: any}\n');
const THROUGH_GATEWAY = 'name: Every way from a person to a database passes the gateway\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: gateway}}\n';
const CLERK_CALLS_API = file('connections/clerk-calls-api.yaml', 'from: clerk\nto: api\n');

/** A ruling of the check, with what it does not say left empty. */
const ruling = (state: Ruling['state'], more: Partial<Ruling> = {}): Ruling => ({ rule: 'r', state, chosen: [], breaks: [], debt: [], ...more });
/** A rule's record, as far as the sentence of where it breaks reads it. */
const written = (fields: Record<string, unknown>) => ({ kind: 'rules', id: 'r', file: 'rules/r.yaml', fields });

test('the list stands in the order of the states, then by name, a rule with no record by its id; the line and the dot are the check’s', () => {
  const rules = book(
    rule('only-api', ONLY_API),
    ALWAYS_THERE,
    rule('a-typo', 'name: Nothing is in the shopp\nnever: {within: shopp}\n'),
    rule('misspelt', 'name: Misspelt\nnever: {too: {id: api}}\n'),
    rule('queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: api}}\n'),
    rule('clerk-not-at-bank', 'name: The clerk does not reach the bank\nnever: {way: {from: {id: clerk}, to: {id: bank}}}\n'),
    rule('no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
  );
  expect(rules.rows.map((row) => [row.id, row.state])).toEqual([
    ['always-there', 'broken'],
    ['only-api', 'broken'],
    ['misspelt', 'not-judged'],
    ['a-typo', 'not-judged'],
    ['queues', 'nothing'],
    ['no-browser-database', 'holds'],
    ['clerk-not-at-bank', 'holds'],
  ]);
  expect(rules.rows[0]).toEqual({ id: 'always-there', name: 'Everything in the shop is always there', state: 'broken' });
  expect(rules.line).toBe('7 rules of your own: 2 hold, 2 broken, 1 looks at nothing, 2 not judged.');
  expect(rules.dot).toBe('broken');
  expect(dotOf([ruling('holds'), ruling('not-judged'), ruling('nothing')])).toBe('not-judged');
  expect(dotOf([ruling('holds'), ruling('nothing')])).toBeUndefined();
  expect(book().rows).toEqual([]);
  expect(book().line).toBeUndefined();
});

test('where a rule breaks, in one sentence: how many of what it looks at, of what it forbids, or of ways; nothing for a rule that is not broken', () => {
  const each = written({ each: { kind: 'apps' }, must: { owner: 'any' } });
  const never = written({ never: { kind: 'queue' } });
  expect(whereWords(ruling('broken', { chosen: ['a', 'b', 'c', 'd', 'e'], breaks: ['a', 'b', 'c'] }), each)).toBe('3 of the 5 records it looks at do not match Must.');
  expect(whereWords(ruling('broken', { chosen: ['a', 'b'], breaks: ['a'], debt: ['b'] }), each)).toBe('1 of the 2 records it looks at does not match Must. 1 more stands in debt.');
  expect(whereWords(ruling('broken', { chosen: ['a'], breaks: ['a'] }), each)).toBe('The one record it looks at does not match Must.');
  expect(whereWords(ruling('broken', { chosen: ['a', 'b'], breaks: ['a', 'b'] }), each)).toBe('None of the 2 records it looks at matches Must.');
  expect(whereWords(ruling('broken', { chosen: ['a', 'b'], breaks: ['a', 'b'] }), never)).toBe('2 records are what this rule says must never be there.');
  expect(whereWords(ruling('broken', { chosen: ['a'], breaks: ['a'] }), never)).toBe('1 record is what this rule says must never be there.');
  const way = { from: 'a', to: 'b', by: ['c'], more: 0 };
  expect(whereWords(ruling('broken', { pairs: 1, ways: [way] }), written({ each: { way: {} }, must: { through: {} } }))).toBe('1 way does not pass what Must names. It is the shortest from its start.');
  expect(whereWords(ruling('broken', { pairs: 11, ways: Array.from({ length: 11 }, () => way) }), written({ never: { way: {} } }))).toBe('11 ways lead where the rule says none may. Each is the shortest from its start.');
  expect(whereWords(ruling('holds', { debt: ['a'] }), each)).toBeUndefined();
  expect(whereWords(ruling('not-judged'), undefined)).toBeUndefined();
});

test('a record that breaks a rule with must says which lines of must it does not match', () => {
  // The worker writes the orders, is not the API, and has no owner of its own but the shop's: only `from` is missed.
  const rules = book(rule('only-api', 'name: Only the API writes orders, and its owner is known\neach: {to: {id: orders}, access: [write, read-write]}\nmust: {from: {id: api}, access: any}\n'));
  const read = rules.rule('only-api');
  expect(read?.where).toBe('1 of the 2 records it looks at does not match Must.');
  expect(read?.breaks).toEqual(['worker-writes-orders']);
  expect(read?.misses).toEqual({ 'worker-writes-orders': [{ keys: ['from', 'id'], ids: ['api'] }] });
  // A ban has no `must`, so its breaks say nothing they miss.
  expect(book(ALWAYS_THERE).rule('always-there')).toMatchObject({ where: '1 record is what this rule says must never be there.', misses: {} });
});

test('a rule whose file has a fault of form has no record and no name: its id stands for it, with its problem and no rule as written', () => {
  const rules = book(rule('misspelt', 'name: Misspelt\nnever: {too: {id: api}}\n'));
  expect(rules.rows).toEqual([{ id: 'misspelt', state: 'not-judged' }]);
  const read = rules.rule('misspelt');
  expect(read).toMatchObject({ id: 'misspelt', elsewhere: false, breaks: [], written: [], ways: [], debt: [] });
  expect(read?.record).toBeUndefined();
  expect(read?.name).toBeUndefined();
  expect(read?.lookedAt).toBeUndefined();
  expect(read?.problems.map((problem) => [problem.rule, `${problem.file}:${problem.line}:${problem.column}`])).toEqual([['key-unknown', 'rules/misspelt.yaml:2:9']]);
  expect(rules.rule('nobody')).toBeUndefined();
});

test('the lines of a selector: one for each value at a leaf, with its keys; ids for the keys of ids, unless any or none; plain words for the rest', () => {
  expect(
    selectorLines({ owner: 'none', data: 'receipt', via: 'any', to: { external: false, id: ['api', 'web'] }, from: { not: { owner: 'sales' }, kind: ['people', 'systems'] } }),
  ).toEqual([
    // A connection reads from its start to its end, then the rest as given.
    { keys: ['from', 'not', 'owner'], ids: ['sales'] },
    { keys: ['from', 'kind'], words: 'people, systems' },
    { keys: ['to', 'external'], words: 'false' },
    { keys: ['to', 'id'], ids: ['api', 'web'] },
    { keys: ['via'], words: 'any' },
    { keys: ['owner'], words: 'none' },
    { keys: ['data'], ids: ['receipt'] },
  ]);
  const read = readModel([...BASE, rule('through-gateway', THROUGH_GATEWAY)]);
  const record = read.records.find((each) => each.kind === 'rules');
  expect(record && writtenOf(record)).toEqual([
    {
      label: 'Each',
      lines: [
        { keys: ['way', 'from', 'kind'], words: 'people' },
        { keys: ['way', 'to', 'kind'], words: 'database' },
      ],
    },
    { label: 'Must', lines: [{ keys: ['through', 'id'], ids: ['gateway'] }] },
  ]);
});

test('the problems of a rule are those of its own file but its breaks; a debt stands or is paid, and is not said while the rule is not judged', () => {
  const records = book(rule('only-api', `${ONLY_API}debt: [worker-writes-orders, api-writes-orders]\n`), file('connections/web-writes-orders.yaml', 'from: web\nto: orders\naccess: write\n'));
  const onlyApi = records.rule('only-api');
  expect(onlyApi?.problems.map((problem) => `${problem.rule} ${problem.file}:${problem.line}`)).toEqual(['debt-paid rules/only-api.yaml:4']);
  expect(onlyApi?.debt).toEqual([
    { id: 'worker-writes-orders', paid: false },
    { id: 'api-writes-orders', paid: true },
  ]);
  expect(onlyApi?.where).toBe('1 of the 3 records it looks at does not match Must. 1 more stands in debt.');
  // The break of a way is at the rule's own file, and is no problem of the section.
  const ways = book(CLERK_CALLS_API, rule('through-gateway', `${THROUGH_GATEWAY}debt: [web-calls-api]\n`));
  expect(ways.rule('through-gateway')?.problems.map((problem) => problem.rule)).toEqual(['debt-paid']);
  // Not judged since another file has an error: no problem of its own, and no debt said.
  const elsewhere = book(rule('only-api', `${ONLY_API}debt: [worker-writes-orders]\n`), file('apps/bad.yaml', 'name: Bad\nin: shop\ncolour: red\n'));
  expect(elsewhere.rule('only-api')).toMatchObject({ problems: [], elsewhere: true, debt: [] });
  expect(elsewhere.rule('only-api')?.where).toBeUndefined();
});

test('the things a way passes: the start of its first connection, then the end of each it goes by', () => {
  const rules = book(
    CLERK_CALLS_API,
    file('stores/archive.yaml', 'name: Archive\nin: shop\nkind: database\n'),
    file('connections/api-writes-archive.yaml', 'from: api\nto: archive\naccess: write\n'),
    rule('through-gateway', THROUGH_GATEWAY),
    rule('through-worker', 'name: Every way from a person to a database passes the worker\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: worker}}\n'),
  );
  expect(rules.rule('through-gateway')?.ways).toEqual([{ things: ['clerk', 'api', 'archive'], by: ['clerk-calls-api', 'api-writes-archive'], more: 1 }]);
  expect(rules.rule('through-worker')?.ways).toEqual([{ things: ['clerk', 'api', 'archive'], by: ['clerk-calls-api', 'api-writes-archive'], more: 1 }]);
  expect(rules.rule('through-gateway')?.where).toBe('1 way does not pass what Must names. It is the shortest from its start.');
  // A connection that names no record leaves out its end; the start is the way's own then.
  expect(thingsOf({ from: 'clerk', by: ['lost', 'api-writes-orders'] }, () => undefined)).toEqual(['clerk']);
});

test('what a rule looked at: every record each chose, the whole model for never, the pairs a way joins, and the connections the flows walk', () => {
  const rules = book(
    rule('only-api', ONLY_API),
    ALWAYS_THERE,
    rule('no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
    rule('through-gateway', THROUGH_GATEWAY),
    rule('misspelt', 'name: Misspelt\nnever: {too: {id: api}}\n'),
    file('features/selling.yaml', 'name: Selling\n'),
    file('data/receipt.yaml', 'name: Receipt\n'),
    file('flows/sells.yaml', 'name: Selling\nstarts: A clerk sells\nends: Sold\nfeature: selling\nsteps:\n  - {id: asks, does: clerk-uses-web, name: Asks}\n  - {id: back, reply: asks, name: The receipt, data: [receipt]}\n'),
    rule('no-receipt', 'name: No receipt is passed\nnever: {data: receipt}\n'),
  );
  // The model holds 13 records, a feature, a data record and a flow: 16.
  // Records stand by name, as the lists of Models have them; a connection with no name after those with one.
  expect(rules.rule('only-api')?.lookedAt).toEqual({ records: ['api-writes-orders', 'worker-writes-orders'], lines: [] });
  expect(book(rule('apps', 'name: Every app is a service\neach: {kind: apps}\nmust: {kind: service}\n')).rule('apps')).toMatchObject({
    breaks: ['web', 'worker'],
    lookedAt: { records: ['api', 'web', 'worker'] },
  });
  expect(rules.rule('always-there')?.lookedAt).toEqual({ records: [], lines: ['Every record of the model, 16. 1 is like this.'] });
  expect(rules.rule('no-browser-database')?.lookedAt).toEqual({ records: [], lines: ['Every record of the model, 16. None is like this.'] });
  expect(rules.rule('through-gateway')?.lookedAt).toEqual({ records: [], lines: ['1 pair of a start and an end that a way joins.'] });
  expect(rules.rule('no-receipt')?.lookedAt).toEqual({
    records: [],
    lines: ['Every record of the model, 16. 1 is like this.', 'The flows walk 1 of the 4 connections it could look at.'],
  });
  expect(rules.rule('misspelt')?.lookedAt).toBeUndefined();
});

test('the rules of a record: those it breaks, those it is in debt of, and for a connection those of a way that breaks, in the order of the list', () => {
  const rules = book(
    CLERK_CALLS_API,
    rule('only-api', `${ONLY_API}debt: [worker-writes-orders]\n`),
    file('connections/web-writes-orders.yaml', 'from: web\nto: orders\naccess: write\n'),
    ALWAYS_THERE,
    rule('through-gateway', THROUGH_GATEWAY),
  );
  expect(rules.rulesOf('web-writes-orders')).toEqual([{ rule: 'only-api', name: 'Only the API writes orders', how: 'breaks' }]);
  expect(rules.rulesOf('worker-writes-orders')).toEqual([{ rule: 'only-api', name: 'Only the API writes orders', how: 'debt' }]);
  expect(rules.rulesOf('api-writes-orders')).toEqual([{ rule: 'through-gateway', name: 'Every way from a person to a database passes the gateway', how: 'way' }]);
  expect(rules.rulesOf('worker').map((each) => [each.rule, each.how])).toEqual([['always-there', 'breaks']]);
  expect(rules.rulesOf('gateway')).toEqual([]);
});
