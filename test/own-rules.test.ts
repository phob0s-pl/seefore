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
const read = (...files: SourceFile[]) => readModel([...BASE, ...files]);
const stateOf = (model: ReturnType<typeof read>, id: string) => model.rulings.find((ruling) => ruling.rule === id)?.state;

const THROUGH_GATEWAY = 'name: Every way from a person to a database passes the gateway\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: gateway}}\n';
const ONLY_API = 'name: Only the API writes orders\neach: {to: {id: orders}, access: [write, read-write]}\nmust: {from: {id: api}}\n';

test('a model with a rule of each form has no problem, and each rule holds', () => {
  const model = read(
    rule('no-browser-database', 'name: No browser reaches a database\nnever: {from: {kind: browser}, to: {kind: database}}\n'),
    rule('sales-writes-orders', 'name: Sales writes the orders\neach: {to: {id: orders}, access: write}\nmust: {from: {owner: sales}}\n'),
    rule('clerk-not-at-bank', 'name: The clerk does not reach the bank\nnever: {way: {from: {id: clerk}, to: {id: bank}}}\n'),
    rule('through-gateway', THROUGH_GATEWAY),
  );
  expect(model.problems).toEqual([]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([
    ['clerk-not-at-bank', 'holds'],
    ['no-browser-database', 'holds'],
    ['sales-writes-orders', 'holds'],
    ['through-gateway', 'holds'],
  ]);
  // The way passes the gateway by a hop of `web-calls-api`, and the owner is taken from the shop.
  expect(model.rulings.find((ruling) => ruling.rule === 'through-gateway')).toMatchObject({ pairs: 1, ways: [], debt: [] });
  expect(model.rulings.find((ruling) => ruling.rule === 'sales-writes-orders')).toMatchObject({ chosen: ['api-writes-orders', 'worker-writes-orders'], breaks: [] });
  expect(model.records.filter((record) => record.kind === 'rules')).toHaveLength(4);
});

test('never broken is an error at the record that breaks it, with its condition and the rule as the second place', () => {
  const model = read(rule('always-there', 'name: Everything in the shop is always there\nnever: {within: shop, only: any}\n'));
  expect(model.problems).toEqual([
    {
      file: 'apps/worker.yaml',
      line: 1,
      column: 1,
      record: 'worker',
      rule: 'rules/always-there',
      severity: 'error',
      message: '`worker` breaks the rule `always-there`: Everything in the shop is always there. It is there only when the night runs.',
      fix: 'Change the record so that the rule holds, or change the rule in `rules/always-there.yaml`. To let it stand for now, add `worker` to `debt` of the rule.',
      second: { file: 'rules/always-there.yaml', line: 2, column: 8, record: 'always-there', field: 'never' },
    },
  ]);
  expect(model.rulings[0]).toMatchObject({ state: 'broken', chosen: ['worker'], breaks: ['worker'] });
});

test('"only the API writes orders": each that does not match must breaks the rule', () => {
  const model = read(rule('only-api', ONLY_API));
  expect(model.problems.map((problem) => [problem.rule, problem.file])).toEqual([['rules/only-api', 'connections/worker-writes-orders.yaml']]);
  expect(model.rulings[0]).toMatchObject({ state: 'broken', chosen: ['api-writes-orders', 'worker-writes-orders'], breaks: ['worker-writes-orders'] });
});

test('a way that does not pass through breaks the rule, at the rule, with its shortest way', () => {
  const model = read(rule('through-gateway', THROUGH_GATEWAY), file('connections/clerk-calls-api.yaml', 'from: clerk\nto: api\n'));
  expect(model.problems).toHaveLength(1);
  expect(model.problems[0]).toMatchObject({ file: 'rules/through-gateway.yaml', line: 2, column: 7, record: 'through-gateway', rule: 'rules/through-gateway', severity: 'error' });
  expect(model.problems[0]?.message).toBe(
    'A way from `clerk` to `orders` breaks the rule: Every way from a person to a database passes the gateway. It goes by `clerk-calls-api` and `api-writes-orders`.',
  );
  expect(model.rulings[0]).toMatchObject({ state: 'broken', pairs: 1, ways: [{ from: 'clerk', to: 'orders', by: ['clerk-calls-api', 'api-writes-orders'], more: 0 }] });
});

test('a way goes on from its start but stops at a person, and never turns at a hop', () => {
  const model = read(
    file('connections/api-asks-clerk.yaml', 'from: api\nto: clerk\n'),
    file('connections/gateway-calls-bank.yaml', 'from: gateway\nto: bank\n'),
    rule('api-not-to-web', 'name: The API does not reach the web app\nnever: {way: {from: {id: api}, to: {id: web}}}\n'),
    rule('web-not-to-bank', 'name: The web app does not reach the bank\nnever: {way: {from: {id: web}, to: {id: bank}}}\n'),
    rule('clerk-not-to-api', 'name: The clerk does not reach the API\nnever: {way: {from: {id: clerk}, to: {id: api}}}\n'),
  );
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state, ruling.pairs])).toEqual([
    ['api-not-to-web', 'holds', 0],
    ['clerk-not-to-api', 'broken', 1],
    ['web-not-to-bank', 'holds', 0],
  ]);
  expect(model.problems.map((problem) => problem.message)).toEqual([
    'A way from `clerk` to `api` breaks the rule: The clerk does not reach the API. It goes by `clerk-uses-web` and `web-calls-api`.',
  ]);
});

test('connection in must asks that a connection is there, at the end it leaves open', () => {
  const rules = rule('written', 'name: Every database is written by a service\neach: {kind: database}\nmust: {connection: {from: {kind: service}, access: write}}\n');
  expect(read(rules).problems).toEqual([]);
  const model = read(rules, file('stores/archive.yaml', 'name: Archive\nin: shop\nkind: database\n'), file('connections/archive-feeds-api.yaml', 'from: archive\nto: api\n'));
  expect(model.problems.map((problem) => [problem.rule, problem.record])).toEqual([['rules/written', 'archive']]);
});

test("an owner is taken from what a part is in; a feature's is its own, and a person has none to match", () => {
  const model = read(
    file('features/selling.yaml', 'name: Selling\n'),
    rule('apps-of-sales', 'name: Every app is of Sales\neach: {kind: apps}\nmust: {owner: sales}\n'),
    rule('owned', 'name: Everything has an owner\nnever: {owner: none}\n'),
  );
  expect(stateOf(model, 'apps-of-sales')).toBe('holds');
  expect(model.rulings.find((ruling) => ruling.rule === 'owned')).toMatchObject({ state: 'broken', chosen: ['bank', 'selling'] });
});

test('data is seen on a connection from the steps of a flow, and a rule over data that no flow walks looks at nothing', () => {
  const model = read(
    file('features/selling.yaml', 'name: Selling\n'),
    file('data/receipt.yaml', 'name: Receipt\n'),
    file('flows/selling.yaml', 'name: Selling\nstarts: A clerk sells\nends: Sold\nfeature: selling\nsteps:\n  - {id: asks, does: clerk-uses-web, name: Asks}\n  - {id: back, reply: asks, name: The receipt, data: [receipt]}\n'),
    rule('no-receipt-to-web', 'name: No receipt goes to the web app\nnever: {data: receipt}\n'),
    rule('orders-data', 'name: The orders get only order data\nnever: {to: {id: orders}, data: any}\n'),
  );
  expect(model.problems.filter((problem) => problem.rule === 'rules/no-receipt-to-web').map((problem) => problem.record)).toEqual(['clerk-uses-web']);
  const nothing = model.problems.find((problem) => problem.rule === 'rule-looks-at-nothing');
  expect(nothing).toMatchObject({ file: 'rules/orders-data.yaml', severity: 'warning', line: 2, column: 33 });
  expect(nothing?.message).toBe('The rule looks at `data`, and no flow walks any of the 2 connections it could look at.');
  expect(model.rulings.find((ruling) => ruling.rule === 'orders-data')).toMatchObject({ state: 'nothing', walked: { connections: 2, walked: 0 } });
});

test('debt lets a break stand, a new break still fails, and a debt that breaks nothing is paid', () => {
  const model = read(rule('only-api', `${ONLY_API}debt: [worker-writes-orders, api-writes-orders]\n`), file('connections/web-writes-orders.yaml', 'from: web\nto: orders\naccess: write\n'));
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.line])).toEqual([
    ['rules/only-api', 'connections/web-writes-orders.yaml', 1],
    ['debt-paid', 'rules/only-api.yaml', 4],
  ]);
  expect(model.problems[1]?.message).toBe('`api-writes-orders` is in `debt` of the rule and does not break it any more.');
  expect(model.rulings[0]).toMatchObject({ state: 'broken', breaks: ['web-writes-orders'], debt: ['worker-writes-orders'] });
  // Of a way, the connections in debt are not walked; one is paid when walking it again adds no break.
  const ways = read(file('connections/clerk-calls-api.yaml', 'from: clerk\nto: api\n'), rule('through-gateway', `${THROUGH_GATEWAY}debt: [clerk-calls-api, web-calls-api]\n`));
  expect(ways.problems.map((problem) => [problem.rule, problem.field, problem.message])).toEqual([
    ['debt-paid', 'debt', '`web-calls-api` is in `debt` of the rule and does not break it any more.'],
  ]);
  expect(ways.rulings[0]).toMatchObject({ state: 'holds', debt: ['clerk-calls-api'] });
});

test('a key not known and an id that names nothing are errors in words, and the rule is not judged', () => {
  const model = read(
    rule('colour', 'name: Red\nnever: {from: {colour: red}}\n'),
    rule('typo', 'name: Nothing in the shop\nnever: {within: shopp}\n'),
    rule('names-a-rule', 'name: Names a rule\nnever: {id: typo}\n'),
    file('connections/to-a-rule.yaml', 'from: clerk\nto: typo\n'),
  );
  const messages = model.problems.map((problem) => `${problem.file}:${problem.line}:${problem.column} ${problem.rule}: ${problem.message}`);
  expect(messages).toEqual([
    'connections/to-a-rule.yaml:2:5 reference-wrong-kind: `to` names `typo`, which is a rule. An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    expect.stringMatching(/^rules\/colour.yaml:2:16 key-unknown: `colour` is not a key of `never.from`. Its keys are `id`, `kind`, /),
    'rules/names-a-rule.yaml:2:13 reference-wrong-kind: `never.id` names `typo`, which is a rule. A rule chooses among the records of the other twelve folders, and never a rule.',
    'rules/typo.yaml:2:17 reference-unknown: `never.within` names `shopp`, but no record has that id. The nearest id is `shop`.',
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['not-judged', 'not-judged', 'not-judged']);
});

test('rule-shape: two forms at once, and through where no way is, are one problem each; way deeper in a selector is no key', () => {
  const model = read(
    rule('both', 'name: Both\nnever: {id: api}\neach: {id: web}\nmust: {kind: apps}\n'),
    rule('deep', 'name: Deep\nnever: {from: {way: {to: {id: api}}}}\n'),
    rule('stray', 'name: Stray\neach: {kind: apps}\nmust: {through: {id: gateway}}\n'),
  );
  expect(model.problems.map((problem) => [problem.rule, problem.file, problem.field, problem.message.split('. ')[0]])).toEqual([
    ['rule-shape', 'rules/both.yaml', 'each', 'This rule has `never` and `each`'],
    ['key-unknown', 'rules/deep.yaml', 'never', '`way` is not a key of `never.from`'],
    ['rule-shape', 'rules/stray.yaml', 'must', '`must.through` stands only in `must` of a rule of ways, whose `each` is `{way: …}`.'],
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['not-judged', 'not-judged', 'not-judged']);
});

test('an end of a way that is left out is any thing', () => {
  // Everything that reaches the database passes the API, but the worker, which writes it itself.
  const model = read(rule('behind-the-api', 'name: Every way to the orders passes the API\neach: {way: {to: {id: orders}}}\nmust: {through: {id: api}}\n'));
  expect(model.rulings[0]).toMatchObject({ state: 'broken', ways: [{ from: 'worker', to: 'orders', by: ['worker-writes-orders'], more: 0 }] });
  const none = read(rule('no-ends', 'name: No ends\nnever: {way: {}}\n'));
  expect(none.problems.map((problem) => problem.message)).toEqual(['`never.way` has neither `from` nor `to`. A way has one end at least; an end left out is any thing.']);
});

test('a rule that looks at nothing is a warning at the key meant', () => {
  const model = read(
    rule('queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: api}}\n'),
    rule('topics', 'name: No topic feeds the clerk\nnever: {from: {kind: topic}, to: {id: clerk}}\n'),
    rule('clerk-through', 'name: People pass the clerk\neach: {way: {from: {kind: people}, to: {kind: database}}}\nmust: {through: {id: clerk}}\n'),
  );
  expect(model.problems.map((problem) => [problem.file, problem.message])).toEqual([
    ['rules/clerk-through.yaml', 'Everything `from` chooses is chosen by `through` too, so the rule looks at nothing.'],
    ['rules/queues.yaml', '`each` chooses no record, so the rule looks at nothing.'],
    ['rules/topics.yaml', '`never.from` chooses no thing, so the rule looks at nothing.'],
  ]);
  expect(model.rulings.map((ruling) => ruling.state)).toEqual(['nothing', 'nothing', 'nothing']);
});

test('no rule is judged when another file does not read; a faulty rule leaves the rest judged, and the counts given', () => {
  const only = rule('only-api', ONLY_API);
  const broken = read(only, file('apps/bad.yaml', 'name: Bad\nin: shop\ncolour: red\n'));
  expect(broken.rulings).toMatchObject([{ rule: 'only-api', state: 'not-judged', chosen: [], breaks: [], debt: [] }]);
  expect(broken.problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
  expect(broken.counts[0]?.checked).toBeNull();
  const faultyRule = read(only, rule('faulty', 'name: Faulty\nnever: {colour: red}\n'));
  expect(faultyRule.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([
    ['faulty', 'not-judged'],
    ['only-api', 'broken'],
  ]);
  expect(faultyRule.counts[0]?.checked).not.toBeNull();
});

test('seefore check ends with the line of the rules, and --json gives each ruling', async () => {
  const folder = await mkdtemp(join(tmpdir(), 'seefore-'));
  const files = [
    ...BASE,
    rule('only-api', `${ONLY_API}debt: [worker-writes-orders]\n`),
    rule('queues', 'name: Every queue is written by the API\neach: {kind: queue}\nmust: {from: {id: api}}\n'),
    rule('always-there', 'name: Everything in the shop is always there\nnever: {within: shop, only: any}\n'),
    rule('faulty', 'name: Faulty\nnever: {colour: red}\n'),
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
    { rule: 'always-there', state: 'broken', chosen: ['worker'], breaks: ['worker'], debt: [] },
    { rule: 'faulty', state: 'not-judged', chosen: [], breaks: [], debt: [] },
    { rule: 'only-api', state: 'holds', chosen: ['api-writes-orders', 'worker-writes-orders'], breaks: [], debt: ['worker-writes-orders'] },
    { rule: 'queues', state: 'nothing', chosen: [], breaks: [], debt: [] },
  ]);
});
