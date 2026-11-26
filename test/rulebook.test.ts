import { expect, test } from 'vitest';
import type { Ruling } from '../src/model/answer.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { dotOf, rulebookOf, selectorLines, thingsOf, whereWords, writtenOf } from '../src/model/rulebook.ts';

/** A shop of Sales with a gateway, an outside bank and a clerk; the worker is there only at night. */
const BASE: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'owners/owner-sales.yaml', text: 'name: Sales\n' },
  { path: 'systems/system-shop.yaml', text: 'name: Shop\nowner: owner-sales\n' },
  { path: 'systems/system-bank.yaml', text: 'name: Bank\nexternal: true\n' },
  { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\nkind: service\n' },
  { path: 'apps/app-web.yaml', text: 'name: Web\nin: system-shop\nkind: browser\n' },
  { path: 'apps/app-worker.yaml', text: 'name: Worker\nin: system-shop\nonly: when the night runs\n' },
  { path: 'stores/store-orders.yaml', text: 'name: Orders\nin: system-shop\nkind: database\n' },
  { path: 'infrastructure/infra-gateway.yaml', text: 'name: Gateway\nin: system-shop\n' },
  { path: 'people/person-clerk.yaml', text: 'name: Clerk\n' },
  { path: 'connections/connection-clerk-uses-web.yaml', text: 'from: person-clerk\nto: app-web\n' },
  { path: 'connections/connection-web-calls-api.yaml', text: 'from: app-web\nto: app-api\nvia: [infra-gateway]\n' },
  { path: 'connections/connection-api-writes-orders.yaml', text: 'from: app-api\nto: store-orders\naccess: write\n' },
  { path: 'connections/connection-worker-writes-orders.yaml', text: 'from: app-worker\nto: store-orders\naccess: write\n' },
];

const file = (path: string, text: string): SourceFile => ({ path, text });
const rule = (id: string, text: string): SourceFile => file(`rules/${id}.yaml`, text);
const book = (...files: SourceFile[]) => rulebookOf(readModel([...BASE, ...files]));

const ONLY_API = 'name: Only the API writes orders\neach: {to: {id: store-orders}, access: [write, read-write]}\nmust: {from: {id: app-api}}\n';
const ALWAYS_THERE = rule('rule-always-there', 'name: Everything in the shop is always there\nnever: {within: system-shop, only: any}\n');
const THROUGH_GATEWAY = 'name: Every way from a person to a database passes the gateway\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: infra-gateway}}\n';
const CLERK_CALLS_API = file('connections/connection-clerk-calls-api.yaml', 'from: person-clerk\nto: app-api\n');

/** A ruling of the check, with what it does not say left empty. */
const ruling = (state: Ruling['state'], more: Partial<Ruling> = {}): Ruling => ({ rule: 'rule-r', state, chosen: [], breaks: [], debt: [], ...more });
/** A rule's record, as far as the sentence of where it breaks reads it. */
const written = (fields: Record<string, unknown>) => ({ kind: 'rules', id: 'rule-r', file: 'rules/rule-r.yaml', fields });

test('the list stands in the order of the states, then by name, a rule with no record by its id; the dot is the check’s', () => {
  const rules = book(
    rule('rule-only-api', ONLY_API),
    ALWAYS_THERE,
    rule('rule-a-typo', 'name: Nothing is in the shopp\nnever: {within: system-shopp}\n'),
    rule('rule-misspelt', 'name: Misspelt\nnever: {too: {id: app-api}}\n'),
    rule('rule-queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: app-api}}\n'),
    rule('rule-clerk-not-at-bank', 'name: The clerk does not reach the bank\nnever: {way: {from: {id: person-clerk}, to: {id: system-bank}}}\n'),
    rule('rule-no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
  );
  expect(rules.rows.map((row) => [row.id, row.state])).toEqual([
    ['rule-always-there', 'broken'],
    ['rule-only-api', 'broken'],
    ['rule-a-typo', 'not-judged'],
    ['rule-misspelt', 'not-judged'],
    ['rule-queues', 'nothing'],
    ['rule-no-browser-database', 'holds'],
    ['rule-clerk-not-at-bank', 'holds'],
  ]);
  expect(rules.rows[0]).toEqual({ id: 'rule-always-there', name: 'Everything in the shop is always there', state: 'broken' });
  expect(rules.dot).toBe('broken');
  expect(dotOf([ruling('holds'), ruling('not-judged'), ruling('nothing')])).toBe('not-judged');
  expect(dotOf([ruling('holds'), ruling('nothing')])).toBeUndefined();
  expect(book().rows).toEqual([]);
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
  const rules = book(rule('rule-only-api', 'name: Only the API writes orders, and its owner is known\neach: {to: {id: store-orders}, access: [write, read-write]}\nmust: {from: {id: app-api}, access: any}\n'));
  const read = rules.rule('rule-only-api');
  expect(read?.where).toBe('1 of the 2 records it looks at does not match Must.');
  expect(read?.breaks).toEqual(['connection-worker-writes-orders']);
  expect(read?.misses).toEqual({ 'connection-worker-writes-orders': [{ keys: ['from', 'id'], ids: ['app-api'] }] });
  // A ban has no `must`, so its breaks say nothing they miss.
  expect(book(ALWAYS_THERE).rule('rule-always-there')).toMatchObject({ where: '1 record is what this rule says must never be there.', misses: {} });
});

test('a rule whose file has a fault of form has no record and no name: its id stands for it, with its problem and no rule as written', () => {
  const rules = book(rule('rule-misspelt', 'name: Misspelt\nnever: {too: {id: app-api}}\n'));
  expect(rules.rows).toEqual([{ id: 'rule-misspelt', state: 'not-judged' }]);
  const read = rules.rule('rule-misspelt');
  expect(read).toMatchObject({ id: 'rule-misspelt', elsewhere: false, breaks: [], written: [], ways: [], debt: [] });
  expect(read?.record).toBeUndefined();
  expect(read?.name).toBeUndefined();
  expect(read?.lookedAt).toBeUndefined();
  expect(read?.problems.map((problem) => [problem.rule, `${problem.file}:${problem.line}:${problem.column}`])).toEqual([['key-unknown', 'rules/rule-misspelt.yaml:2:9']]);
  expect(rules.rule('rule-nobody')).toBeUndefined();
});

test('the lines of a selector: one for each value at a leaf, with its keys; ids for the keys of ids, unless any or none; plain words for the rest', () => {
  expect(
    selectorLines({ owner: 'none', data: 'data-receipt', via: 'any', to: { external: false, id: ['app-api', 'app-web'] }, from: { not: { owner: 'owner-sales' }, kind: ['people', 'systems'] } }),
  ).toEqual([
    // A connection reads from its start to its end, then the rest as given.
    { keys: ['from', 'not', 'owner'], ids: ['owner-sales'] },
    { keys: ['from', 'kind'], words: 'people, systems' },
    { keys: ['to', 'external'], words: 'false' },
    { keys: ['to', 'id'], ids: ['app-api', 'app-web'] },
    { keys: ['via'], words: 'any' },
    { keys: ['owner'], words: 'none' },
    { keys: ['data'], ids: ['data-receipt'] },
  ]);
  const read = readModel([...BASE, rule('rule-through-gateway', THROUGH_GATEWAY)]);
  const record = read.records.find((each) => each.kind === 'rules');
  expect(record && writtenOf(record)).toEqual([
    {
      label: 'Each',
      lines: [
        { keys: ['way', 'from', 'kind'], words: 'people' },
        { keys: ['way', 'to', 'kind'], words: 'database' },
      ],
    },
    { label: 'Must', lines: [{ keys: ['through', 'id'], ids: ['infra-gateway'] }] },
  ]);
});

test('the problems of a rule are those of its own file but its breaks; a debt stands or is paid, and is not said while the rule is not judged', () => {
  const records = book(rule('rule-only-api', `${ONLY_API}debt: [connection-worker-writes-orders, connection-api-writes-orders]\n`), file('connections/connection-web-writes-orders.yaml', 'from: app-web\nto: store-orders\naccess: write\n'));
  const onlyApi = records.rule('rule-only-api');
  expect(onlyApi?.problems.map((problem) => `${problem.rule} ${problem.file}:${problem.line}`)).toEqual(['debt-paid rules/rule-only-api.yaml:4']);
  expect(onlyApi?.debt).toEqual([
    { id: 'connection-worker-writes-orders', paid: false },
    { id: 'connection-api-writes-orders', paid: true },
  ]);
  expect(onlyApi?.where).toBe('1 of the 3 records it looks at does not match Must. 1 more stands in debt.');
  // The break of a way is at the rule's own file, and is no problem of the section.
  const ways = book(CLERK_CALLS_API, rule('rule-through-gateway', `${THROUGH_GATEWAY}debt: [connection-web-calls-api]\n`));
  expect(ways.rule('rule-through-gateway')?.problems.map((problem) => problem.rule)).toEqual(['debt-paid']);
  // Not judged since another file has an error: no problem of its own, and no debt said.
  const elsewhere = book(rule('rule-only-api', `${ONLY_API}debt: [connection-worker-writes-orders]\n`), file('apps/app-bad.yaml', 'name: Bad\nin: system-shop\ncolour: red\n'));
  expect(elsewhere.rule('rule-only-api')).toMatchObject({ problems: [], elsewhere: true, debt: [] });
  expect(elsewhere.rule('rule-only-api')?.where).toBeUndefined();
});

test('the things a way passes: the start of its first connection, then the end of each it goes by', () => {
  const rules = book(
    CLERK_CALLS_API,
    file('stores/store-archive.yaml', 'name: Archive\nin: system-shop\nkind: database\n'),
    file('connections/connection-api-writes-archive.yaml', 'from: app-api\nto: store-archive\naccess: write\n'),
    rule('rule-through-gateway', THROUGH_GATEWAY),
    rule('rule-through-worker', 'name: Every way from a person to a database passes the worker\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: app-worker}}\n'),
  );
  expect(rules.rule('rule-through-gateway')?.ways).toEqual([{ things: ['person-clerk', 'app-api', 'store-archive'], by: ['connection-clerk-calls-api', 'connection-api-writes-archive'], more: 1 }]);
  expect(rules.rule('rule-through-worker')?.ways).toEqual([{ things: ['person-clerk', 'app-api', 'store-archive'], by: ['connection-clerk-calls-api', 'connection-api-writes-archive'], more: 1 }]);
  expect(rules.rule('rule-through-gateway')?.where).toBe('1 way does not pass what Must names. It is the shortest from its start.');
  // A connection that names no record leaves out its end; the start is the way's own then.
  expect(thingsOf({ from: 'person-clerk', by: ['connection-lost', 'connection-api-writes-orders'] }, () => undefined)).toEqual(['person-clerk']);
});

test('what a rule looked at: every record each chose, the whole model for never, the pairs a way joins, and the connections the flows walk', () => {
  const rules = book(
    rule('rule-only-api', ONLY_API),
    ALWAYS_THERE,
    rule('rule-no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
    rule('rule-through-gateway', THROUGH_GATEWAY),
    rule('rule-misspelt', 'name: Misspelt\nnever: {too: {id: app-api}}\n'),
    file('features/feature-selling.yaml', 'name: Selling\n'),
    file('data/data-receipt.yaml', 'name: Receipt\n'),
    file('flows/flow-sells.yaml', 'name: Selling\nstarts: A clerk sells\nends: Sold\nfeature: feature-selling\nsteps:\n  - {id: asks, does: connection-clerk-uses-web, name: Asks}\n  - {id: back, reply: asks, name: The receipt, data: [data-receipt]}\n'),
    rule('rule-no-receipt', 'name: No receipt is passed\nnever: {data: data-receipt}\n'),
  );
  // The model holds 13 records, a feature, a data record and a flow: 16.
  // Records stand by name, as the lists of Models have them; a connection with no name after those with one.
  expect(rules.rule('rule-only-api')?.lookedAt).toEqual({ records: ['connection-api-writes-orders', 'connection-worker-writes-orders'], lines: [] });
  expect(book(rule('rule-apps', 'name: Every app is a service\neach: {kind: apps}\nmust: {kind: service}\n')).rule('rule-apps')).toMatchObject({
    breaks: ['app-web', 'app-worker'],
    lookedAt: { records: ['app-api', 'app-web', 'app-worker'] },
  });
  expect(rules.rule('rule-always-there')?.lookedAt).toEqual({ records: [], lines: ['Every record of the model, 16. 1 is like this.'] });
  expect(rules.rule('rule-no-browser-database')?.lookedAt).toEqual({ records: [], lines: ['Every record of the model, 16. None is like this.'] });
  expect(rules.rule('rule-through-gateway')?.lookedAt).toEqual({ records: [], lines: ['1 pair of a start and an end that a way joins.'] });
  expect(rules.rule('rule-no-receipt')?.lookedAt).toEqual({
    records: [],
    lines: ['Every record of the model, 16. 1 is like this.', 'The flows walk 1 of the 4 connections it could look at.'],
  });
  expect(rules.rule('rule-misspelt')?.lookedAt).toBeUndefined();
  // A rule chooses no repository, so the whole model it looks at is the 13 records without the two repositories.
  const withRepositories = book(ALWAYS_THERE, file('repositories/repo-shop.yaml', 'name: shop\n'), file('repositories/repo-docs.yaml', 'name: docs\n'));
  expect(readModel([...BASE, file('repositories/repo-shop.yaml', 'name: shop\n'), file('repositories/repo-docs.yaml', 'name: docs\n')]).problems).toEqual([]);
  expect(withRepositories.rule('rule-always-there')?.lookedAt).toEqual({ records: [], lines: ['Every record of the model, 13. 1 is like this.'] });
});

test('the rules of a record: those it breaks, those it is in debt of, and for a connection those of a way that breaks, in the order of the list', () => {
  const rules = book(
    CLERK_CALLS_API,
    rule('rule-only-api', `${ONLY_API}debt: [connection-worker-writes-orders]\n`),
    file('connections/connection-web-writes-orders.yaml', 'from: app-web\nto: store-orders\naccess: write\n'),
    ALWAYS_THERE,
    rule('rule-through-gateway', THROUGH_GATEWAY),
  );
  expect(rules.rulesOf('connection-web-writes-orders')).toEqual([{ rule: 'rule-only-api', name: 'Only the API writes orders', how: 'breaks' }]);
  expect(rules.rulesOf('connection-worker-writes-orders')).toEqual([{ rule: 'rule-only-api', name: 'Only the API writes orders', how: 'debt' }]);
  expect(rules.rulesOf('connection-api-writes-orders')).toEqual([{ rule: 'rule-through-gateway', name: 'Every way from a person to a database passes the gateway', how: 'way' }]);
  expect(rules.rulesOf('app-worker').map((each) => [each.rule, each.how])).toEqual([['rule-always-there', 'breaks']]);
  expect(rules.rulesOf('infra-gateway')).toEqual([]);
});
