import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { run } from '../src/server/command.ts';

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
const read = (...files: SourceFile[]) => readModel([...BASE, ...files]);
const stateOf = (model: ReturnType<typeof read>, id: string) => model.rulings.find((ruling) => ruling.rule === id)?.state;

const THROUGH_GATEWAY = 'name: Every way from a person to a database passes the gateway\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: infra-gateway}}\n';
const ONLY_API = 'name: Only the API writes orders\neach: {to: {id: store-orders}, access: [write, read-write]}\nmust: {from: {id: app-api}}\n';

test('a model with a rule of each form has no problem, and each rule holds', () => {
  const model = read(
    rule('rule-no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
    rule('rule-sales-writes-orders', 'name: Sales writes the orders\neach: {to: {id: store-orders}, access: write}\nmust: {from: {owner: owner-sales}}\n'),
    rule('rule-clerk-not-at-bank', 'name: The clerk does not reach the bank\nnever: {way: {from: {id: person-clerk}, to: {id: system-bank}}}\n'),
    rule('rule-through-gateway', THROUGH_GATEWAY),
  );
  expect(model.problems).toEqual([]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([
    ['rule-clerk-not-at-bank', 'holds'],
    ['rule-no-browser-database', 'holds'],
    ['rule-sales-writes-orders', 'holds'],
    ['rule-through-gateway', 'holds'],
  ]);
  // The way passes the gateway by a hop of `connection-web-calls-api`, and the owner is taken from the shop.
  expect(model.rulings.find((ruling) => ruling.rule === 'rule-through-gateway')).toMatchObject({ pairs: 1, ways: [], debt: [] });
  expect(model.rulings.find((ruling) => ruling.rule === 'rule-sales-writes-orders')).toMatchObject({ chosen: ['connection-api-writes-orders', 'connection-worker-writes-orders'], breaks: [] });
  expect(model.records.filter((record) => record.kind === 'rules')).toHaveLength(4);
});

test('never broken is an error at the record that breaks it, with its condition and the rule as the second place', () => {
  const model = read(rule('rule-always-there', 'name: Everything in the shop is always there\nnever: {within: system-shop, only: any}\n'));
  expect(model.problems).toEqual([
    {
      file: 'apps/app-worker.yaml',
      line: 1,
      column: 1,
      record: 'app-worker',
      rule: 'rules/rule-always-there',
      severity: 'error',
      message: '`app-worker` breaks the rule `rule-always-there`: Everything in the shop is always there. It is there only when the night runs.',
      fix: 'Change the record so that the rule holds, or change the rule in `rules/rule-always-there.yaml`. To let it stand for now, add `app-worker` to `debt` of the rule.',
      second: { file: 'rules/rule-always-there.yaml', line: 2, column: 8, record: 'rule-always-there', field: 'never' },
    },
  ]);
  expect(model.rulings[0]).toMatchObject({ state: 'broken', chosen: ['app-worker'], breaks: ['app-worker'] });
});

test('"only the API writes orders": each that does not match must breaks the rule', () => {
  const model = read(rule('rule-only-api', ONLY_API));
  expect(model.problems.map((problem) => [problem.rule, problem.file])).toEqual([['rules/rule-only-api', 'connections/connection-worker-writes-orders.yaml']]);
  expect(model.rulings[0]).toMatchObject({ state: 'broken', chosen: ['connection-api-writes-orders', 'connection-worker-writes-orders'], breaks: ['connection-worker-writes-orders'] });
});

test('a way that does not pass through breaks the rule, at the rule, with its shortest way', () => {
  const model = read(rule('rule-through-gateway', THROUGH_GATEWAY), file('connections/connection-clerk-calls-api.yaml', 'from: person-clerk\nto: app-api\n'));
  expect(model.problems).toHaveLength(1);
  expect(model.problems[0]).toMatchObject({ file: 'rules/rule-through-gateway.yaml', line: 2, column: 7, record: 'rule-through-gateway', rule: 'rules/rule-through-gateway', severity: 'error' });
  expect(model.problems[0]?.message).toBe(
    'A way from `person-clerk` to `store-orders` breaks the rule: Every way from a person to a database passes the gateway. It goes by `connection-clerk-calls-api` and `connection-api-writes-orders`.',
  );
  expect(model.rulings[0]).toMatchObject({ state: 'broken', pairs: 1, ways: [{ from: 'person-clerk', to: 'store-orders', by: ['connection-clerk-calls-api', 'connection-api-writes-orders'], more: 0 }] });
});

test('a way goes on from its start but stops at a person, and never turns at a hop', () => {
  const model = read(
    file('connections/connection-api-asks-clerk.yaml', 'from: app-api\nto: person-clerk\n'),
    file('connections/connection-gateway-calls-bank.yaml', 'from: infra-gateway\nto: system-bank\n'),
    rule('rule-api-not-to-web', 'name: The API does not reach the web app\nnever: {way: {from: {id: app-api}, to: {id: app-web}}}\n'),
    rule('rule-web-not-to-bank', 'name: The web app does not reach the bank\nnever: {way: {from: {id: app-web}, to: {id: system-bank}}}\n'),
    rule('rule-clerk-not-to-api', 'name: The clerk does not reach the API\nnever: {way: {from: {id: person-clerk}, to: {id: app-api}}}\n'),
  );
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state, ruling.pairs])).toEqual([
    ['rule-api-not-to-web', 'holds', 0],
    ['rule-clerk-not-to-api', 'broken', 1],
    ['rule-web-not-to-bank', 'holds', 0],
  ]);
  expect(model.problems.map((problem) => problem.message)).toEqual([
    'A way from `person-clerk` to `app-api` breaks the rule: The clerk does not reach the API. It goes by `connection-clerk-uses-web` and `connection-web-calls-api`.',
  ]);
});

test('connection in must asks that a connection is there, at the end it leaves open', () => {
  const rules = rule('rule-written', 'name: Every database is written by a service\neach: {kind: database}\nmust: {connection: {from: {kind: service}, access: write}}\n');
  expect(read(rules).problems).toEqual([]);
  const model = read(rules, file('stores/store-archive.yaml', 'name: Archive\nin: system-shop\nkind: database\n'), file('connections/connection-archive-feeds-api.yaml', 'from: store-archive\nto: app-api\n'));
  expect(model.problems.map((problem) => [problem.rule, problem.record])).toEqual([['rules/rule-written', 'store-archive']]);
});

test("an owner is taken from what a part is in; a feature's is its own, and a person has none to match", () => {
  const model = read(
    file('features/feature-selling.yaml', 'name: Selling\n'),
    rule('rule-apps-of-sales', 'name: Every app is of Sales\neach: {kind: apps}\nmust: {owner: owner-sales}\n'),
    rule('rule-owned', 'name: Everything has an owner\nnever: {owner: none}\n'),
  );
  expect(stateOf(model, 'rule-apps-of-sales')).toBe('holds');
  expect(model.rulings.find((ruling) => ruling.rule === 'rule-owned')).toMatchObject({ state: 'broken', chosen: ['feature-selling', 'system-bank'] });
});

test('data is seen on a connection from the steps of a flow, and a rule over data that no flow walks looks at nothing', () => {
  const model = read(
    file('features/feature-selling.yaml', 'name: Selling\n'),
    file('data/data-receipt.yaml', 'name: Receipt\n'),
    file('flows/flow-selling.yaml', 'name: Selling\nstarts: A clerk sells\nends: Sold\nfeature: feature-selling\nsteps:\n  - {id: asks, does: connection-clerk-uses-web, name: Asks}\n  - {id: back, reply: asks, name: The receipt, data: [data-receipt]}\n'),
    rule('rule-no-receipt-to-web', 'name: No receipt goes to the web app\nnever: {data: data-receipt}\n'),
    rule('rule-orders-data', 'name: The orders get only order data\nnever: {to: {id: store-orders}, data: any}\n'),
  );
  expect(model.problems.filter((problem) => problem.rule === 'rules/rule-no-receipt-to-web').map((problem) => problem.record)).toEqual(['connection-clerk-uses-web']);
  const nothing = model.problems.find((problem) => problem.rule === 'rule-looks-at-nothing');
  expect(nothing).toMatchObject({ file: 'rules/rule-orders-data.yaml', severity: 'warning', line: 2, column: 39 });
  expect(nothing?.message).toBe('The rule looks at `data`, and no flow walks any of the 2 connections it could look at.');
  expect(model.rulings.find((ruling) => ruling.rule === 'rule-orders-data')).toMatchObject({ state: 'nothing', walked: { connections: 2, walked: 0 } });
});

test("a rule over `data` does not see what a step only removes: the step walks its connection, and passes nothing on it", () => {
  const clearing = (step: string) =>
    file('flows/flow-clearing.yaml', `name: Clearing old orders\nstarts: An order is a year old\nends: It is gone\nfeature: feature-selling\nsteps:\n  - ${step}\n`);
  const base = [file('features/feature-selling.yaml', 'name: Selling\n'), file('data/data-order.yaml', 'name: Order\n'), rule('rule-no-order-kept', 'name: No order is written to a store\nnever: {to: {kind: stores}, data: data-order}\n')];
  const removes = read(...base, clearing('{id: clears, does: connection-api-writes-orders, name: Deletes the order, removes: [data-order]}'));
  expect(removes.problems).toEqual([]);
  expect(removes.rulings.find((ruling) => ruling.rule === 'rule-no-order-kept')).toMatchObject({ state: 'holds', walked: { connections: 2, walked: 1 } });
  const passes = read(...base, clearing('{id: saves, does: connection-api-writes-orders, name: Saves the order, data: [data-order]}'));
  expect(stateOf(passes, 'rule-no-order-kept')).toBe('broken');
});

test('debt lets a break stand, a new break still fails, and a debt that breaks nothing is paid', () => {
  const model = read(rule('rule-only-api', `${ONLY_API}debt: [connection-worker-writes-orders, connection-api-writes-orders]\n`), file('connections/connection-web-writes-orders.yaml', 'from: app-web\nto: store-orders\naccess: write\n'));
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.line])).toEqual([
    ['rules/rule-only-api', 'connections/connection-web-writes-orders.yaml', 1],
    ['debt-paid', 'rules/rule-only-api.yaml', 4],
  ]);
  expect(model.problems[1]?.message).toBe('`connection-api-writes-orders` is in `debt` of the rule and does not break it any more.');
  expect(model.rulings[0]).toMatchObject({ state: 'broken', breaks: ['connection-web-writes-orders'], debt: ['connection-worker-writes-orders'] });
  // Of a way, the connections in debt are not walked; one is paid when walking it again adds no break.
  const ways = read(file('connections/connection-clerk-calls-api.yaml', 'from: person-clerk\nto: app-api\n'), rule('rule-through-gateway', `${THROUGH_GATEWAY}debt: [connection-clerk-calls-api, connection-web-calls-api]\n`));
  expect(ways.problems.map((problem) => [problem.rule, problem.field, problem.message])).toEqual([
    ['debt-paid', 'debt', '`connection-web-calls-api` is in `debt` of the rule and does not break it any more.'],
  ]);
  expect(ways.rulings[0]).toMatchObject({ state: 'holds', debt: ['connection-clerk-calls-api'] });
});

test('a key not known and an id that names nothing are errors in words, and the rule is not judged', () => {
  const model = read(
    rule('rule-colour', 'name: Red\nnever: {from: {colour: red}}\n'),
    rule('rule-typo', 'name: Nothing in the shop\nnever: {within: system-shopp}\n'),
    rule('rule-names-a-rule', 'name: Names a rule\nnever: {id: rule-typo}\n'),
    file('connections/connection-to-a-rule.yaml', 'from: person-clerk\nto: rule-typo\n'),
  );
  const messages = model.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.rule}: ${problem.message}`);
  expect(messages).toEqual([
    'connections/connection-to-a-rule.yaml:2:5 reference-wrong-kind: `to` names `rule-typo`, which is a rule. An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    expect.stringMatching(/^rules\/rule-colour.yaml:2:16 key-unknown: `colour` is not a key of `never.from`. Its keys are `id`, `kind`, /),
    'rules/rule-names-a-rule.yaml:2:13 reference-wrong-kind: `never.id` names `rule-typo`, which is a rule. A rule chooses among the records of the other twelve folders, and never a rule.',
    'rules/rule-typo.yaml:2:17 reference-unknown: `never.within` names `system-shopp`, but no record has that id. The nearest id is `system-shop`.',
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['not-judged', 'not-judged', 'not-judged']);
});

test('rule-shape: two forms at once, and through where no way is, are one problem each; way deeper in a selector is no key', () => {
  const model = read(
    rule('rule-both', 'name: Both\nnever: {id: app-api}\neach: {id: app-web}\nmust: {kind: apps}\n'),
    rule('rule-deep', 'name: Deep\nnever: {from: {way: {to: {id: app-api}}}}\n'),
    rule('rule-stray', 'name: Stray\neach: {kind: apps}\nmust: {through: {id: infra-gateway}}\n'),
  );
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.field, problem.message.split('. ')[0]])).toEqual([
    ['rule-shape', 'rules/rule-both.yaml', 'each', 'This rule has `never` and `each`'],
    ['key-unknown', 'rules/rule-deep.yaml', 'never', '`way` is not a key of `never.from`'],
    ['rule-shape', 'rules/rule-stray.yaml', 'must', '`must.through` stands only in `must` of a rule of ways, whose `each` is `{way: …}`.'],
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['not-judged', 'not-judged', 'not-judged']);
});

test('an end of a way that is left out is any thing', () => {
  // Everything that reaches the database passes the API, but the worker, which writes it itself.
  const model = read(rule('rule-behind-the-api', 'name: Every way to the orders passes the API\neach: {way: {to: {id: store-orders}}}\nmust: {through: {id: app-api}}\n'));
  expect(model.rulings[0]).toMatchObject({ state: 'broken', ways: [{ from: 'app-worker', to: 'store-orders', by: ['connection-worker-writes-orders'], more: 0 }] });
  const none = read(rule('rule-no-ends', 'name: No ends\nnever: {way: {}}\n'));
  expect(none.problems.map((problem) => problem.message)).toEqual(['`never.way` has neither `from` nor `to`. A way has one end at least; an end left out is any thing.']);
});

test('a rule that looks at nothing is a warning at the key meant', () => {
  const model = read(
    rule('rule-queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: app-api}}\n'),
    rule('rule-topics', 'name: No topic feeds the clerk\nnever: {from: {kind: topic}, to: {id: person-clerk}}\n'),
    rule('rule-clerk-through', 'name: People pass the clerk\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: person-clerk}}\n'),
  );
  expect(model.problems.map((problem) => [problem.file, problem.message])).toEqual([
    ['rules/rule-clerk-through.yaml', 'Everything `from` chooses is chosen by `through` too, so the rule looks at nothing.'],
    ['rules/rule-queues.yaml', '`each` chooses no record, so the rule looks at nothing.'],
    ['rules/rule-topics.yaml', '`never.from` chooses no thing, so the rule looks at nothing.'],
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['nothing', 'nothing', 'nothing']);
});

test('no rule is judged when another file does not read; a faulty rule leaves the rest judged, and the counts given', () => {
  const only = rule('rule-only-api', ONLY_API);
  const broken = read(only, file('apps/app-bad.yaml', 'name: Bad\nin: system-shop\ncolour: red\n'));
  expect(broken.rulings).toMatchObject([{ rule: 'rule-only-api', state: 'not-judged', chosen: [], breaks: [], debt: [] }]);
  expect(broken.problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
  expect(broken.counts[0]?.checked).toBeNull();
  const faultyRule = read(only, rule('rule-faulty', 'name: Faulty\nnever: {colour: red}\n'));
  expect(faultyRule.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([
    ['rule-faulty', 'not-judged'],
    ['rule-only-api', 'broken'],
  ]);
  expect(faultyRule.counts[0]?.checked).not.toBeNull();
});

test('seefore check ends with the line of the rules, and --json gives each ruling', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const files = [
    ...BASE,
    rule('rule-only-api', `${ONLY_API}debt: [connection-worker-writes-orders]\n`),
    rule('rule-queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: app-api}}\n'),
    rule('rule-always-there', 'name: Everything in the shop is always there\nnever: {within: system-shop, only: any}\n'),
    rule('rule-faulty', 'name: Faulty\nnever: {colour: red}\n'),
  ];
  for (const { path, text } of files) {
    await mkdir(dirname(join(folder, path)), { recursive: true });
    await writeFile(join(folder, path), text);
  }
  const lines: string[] = [];
  const io = { out: (line: string) => lines.push(line), err: (line: string) => lines.push(line) };
  expect(await run(['check', `--workdir=${folder}`], '/here', io)).toBe(1);
  expect(lines.at(-1)).toBe('4 rules of your own: 1 holds, 1 broken, 1 looks at nothing, 1 not judged. 1 of debt.');
  lines.length = 0;
  expect(await run(['check', '--json', `--workdir=${folder}`], '/here', io)).toBe(1);
  const json = JSON.parse(lines[0] as string);
  expect(json.rulings).toEqual([
    { rule: 'rule-always-there', state: 'broken', chosen: ['app-worker'], breaks: ['app-worker'], debt: [] },
    { rule: 'rule-faulty', state: 'not-judged', chosen: [], breaks: [], debt: [] },
    { rule: 'rule-only-api', state: 'holds', chosen: ['connection-api-writes-orders', 'connection-worker-writes-orders'], breaks: [], misses: {}, debt: ['connection-worker-writes-orders'] },
    { rule: 'rule-queues', state: 'nothing', chosen: [], breaks: [], misses: {}, debt: [] },
  ]);
});
