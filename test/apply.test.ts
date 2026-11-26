import { expect, test } from 'vitest';
import { applyChange } from '../src/model/apply.ts';
import type { Applied } from '../src/model/apply.ts';
import { EXAMPLES } from '../src/model/guide.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

/** A record's file, a line an argument, ending with a line break. */
const file = (path: string, ...lines: string[]): SourceFile => ({ path: `${path}.yaml`, text: `${lines.join('\n')}\n` });

/** A small shop as a person writes it, with folded text: a customer orders through the API, which writes the orders. One store stands alone. */
const SHOP: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/system-shop', 'name: Shop', 'description: Sells things online.'),
  file('apps/app-api', 'name: API', 'in: system-shop', 'description: >-', '  Takes the orders', '  and keeps them.', 'kind: service', 'technology:', '  - tech-go'),
  file('stores/store-orders', 'name: Orders', 'in: system-shop', 'kind: database'),
  file('stores/store-old', 'name: Old orders', 'in: system-shop'),
  file('people/person-customer', 'name: Customer'),
  file('technologies/tech-go', 'name: Go'),
  file('connections/connection-customer-orders', 'from: person-customer', 'to: app-api', 'name: Places an order'),
  file('connections/connection-api-writes-orders', 'from: app-api', 'to: store-orders', 'access: write', 'name: Saves the order'),
  file('features/feature-ordering', 'name: Ordering'),
  file(
    'flows/flow-placing',
    'name: Placing an order',
    'starts: A customer places an order',
    'ends: The order is kept',
    'feature: feature-ordering',
    'steps:',
    '  - id: places',
    '    does: connection-customer-orders',
    '    description: >-',
    '      Sends the order,',
    '      and waits for the answer.',
    '  - id: saves',
    '    does: connection-api-writes-orders',
    '  - id: confirms',
    '    reply: places',
    '    name: Confirms the order',
  ),
];

/** The shop with one change, `changes/a-change.yaml`, whose body is the text given. */
const withChange = (body: string, model: SourceFile[] = SHOP, id = 'a-change'): SourceFile[] => [...model, { path: `changes/${id}.yaml`, text: `name: A change\nprompt: Make it so.\n${body}` }];

/** What applying the change comes to, when it is not refused. */
function applied(files: readonly SourceFile[], id = 'a-change'): Applied {
  const done = applyChange(files, id);
  if ('refusals' in done) throw new Error(done.refusals.join('\n'));
  return done;
}

/** The text a file is written with. */
const written = (done: Applied, path: string): string | undefined => done.written.find((each) => each.path === path)?.text;

test('the shop reads with no problem', () => {
  expect(readModel(SHOP).problems).toEqual([]);
});

test('a new record is its lines in the change, moved left to the first column, with folded text as it is folded', () => {
  const body = [
    'add:',
    '  apps/app-worker:',
    '    name: Worker',
    '    in: system-shop',
    '    description: >-',
    '      Takes each order off the list,',
    '      and packs it.',
    '',
    '  connections/connection-api-calls-worker:',
    '    from: app-api',
    '    to: app-worker',
    '    name: Hands the order on',
    '',
    '',
  ].join('\n');
  const done = applied(withChange(body));
  expect(done.lines).toEqual(['+ apps/app-worker', '+ connections/connection-api-calls-worker']);
  expect([done.added, done.updated, done.removed]).toEqual([2, 0, 0]);
  expect(done.written.map((each) => each.path)).toEqual(['apps/app-worker.yaml', 'connections/connection-api-calls-worker.yaml']);
  // The blank lines between the records and at the end of the change go with neither.
  expect(written(done, 'apps/app-worker.yaml')).toBe('name: Worker\nin: system-shop\ndescription: >-\n  Takes each order off the list,\n  and packs it.\n');
  expect(written(done, 'connections/connection-api-calls-worker.yaml')).toBe('from: app-api\nto: app-worker\nname: Hands the order on\n');
  expect(done.whole).toEqual([]);
  expect(done.after.records.find((each) => each.id === 'app-worker')?.fields).toEqual({ name: 'Worker', in: 'system-shop', description: 'Takes each order off the list, and packs it.' });
  expect(done.after.problems).toEqual([]);
});

test('an update rewrites only the keys it names: a new key at its place, a key taken out, one with no effect left, every other line as it was', () => {
  const body = ['update:', '  apps/app-api:', '    name: Order API', '    only: when the shop is open', '    kind: service', '    technology: null', ''].join('\n');
  const done = applied(withChange(body));
  expect(done.lines).toEqual(['~ apps/app-api: name, only, kind, technology']);
  expect([done.added, done.updated, done.removed]).toEqual([0, 1, 0]);
  // `only` goes after `in`, the nearest key before it in the order of an app's keys; the folded description is not touched.
  expect(written(done, 'apps/app-api.yaml')).toBe('name: Order API\nin: system-shop\nonly: when the shop is open\ndescription: >-\n  Takes the orders\n  and keeps them.\nkind: service\n');
  expect(done.warnings.map((problem) => [problem.rule, problem.message])).toEqual([['change-no-effect', '`kind` of `apps/app-api` under `update` is what the record says already.']]);
  // A file that nothing changes is not written.
  const same = applied(withChange('update:\n  apps/app-api:\n    kind: service\n'));
  expect(same.lines).toEqual(['~ apps/app-api: kind']);
  expect(same.written).toEqual([]);
});

test("a step named by a bare id keeps its lines, a step written whole stands at the column of the file's steps, and a step left out is gone", () => {
  // The change writes its steps at the column of `steps`; the file's stand two further in.
  const body = ['update:', '  flows/flow-placing:', '    steps:', '    - places', '    - id: checks', '      does: app-api', '      name: Checks the stock', '    - confirms', ''].join('\n');
  const done = applied(withChange(body));
  expect(done.lines).toEqual(['~ flows/flow-placing: steps']);
  expect(written(done, 'flows/flow-placing.yaml')).toBe(
    [
      'name: Placing an order',
      'starts: A customer places an order',
      'ends: The order is kept',
      'feature: feature-ordering',
      'steps:',
      '  - id: places',
      '    does: connection-customer-orders',
      '    description: >-',
      '      Sends the order,',
      '      and waits for the answer.',
      '  - id: checks',
      '    does: app-api',
      '    name: Checks the stock',
      '  - id: confirms',
      '    reply: places',
      '    name: Confirms the order',
      '',
    ].join('\n'),
  );
  expect(done.whole).toEqual([]);
});

test("the files it removes go, and `status: applied` is the change's one new last line", () => {
  const files = withChange('remove:\n  - stores/store-old\n');
  const done = applied(files);
  expect(done.lines).toEqual(['- stores/store-old']);
  expect([done.added, done.updated, done.removed]).toEqual([0, 0, 1]);
  expect(done.gone).toEqual(['stores/store-old.yaml']);
  expect(done.written).toEqual([]);
  expect(done.change).toEqual({ path: 'changes/a-change.yaml', text: `${files.at(-1)?.text}status: applied\n` });
  expect(done.after.records.some((each) => each.id === 'store-old')).toBe(false);
  expect(done.after.records.find((each) => each.kind === 'changes')?.fields.status).toBe('applied');
  // A file that ends with no line break gets one first; one with carriage returns gets its own.
  expect(applied(withChange('remove:\n  - stores/store-old')).change.text).toBe('name: A change\nprompt: Make it so.\nremove:\n  - stores/store-old\nstatus: applied\n');
  expect(applied([...SHOP, { path: 'changes/a-change.yaml', text: 'name: A change\r\nprompt: Make it so.\r\nremove:\r\n  - stores/store-old\r\n' }]).change.text).toBe('name: A change\r\nprompt: Make it so.\r\nremove:\r\n  - stores/store-old\r\nstatus: applied\r\n');
});

test('what the check faults, a decided change, an input alone and a change that is not there are refused, and nothing moves', () => {
  const faulted = applyChange(withChange('update:\n  apps/app-apy:\n    name: Nothing\n'), 'a-change');
  expect(faulted).toEqual({ refusals: ['The check faults `changes/a-change`:'], faults: [expect.objectContaining({ file: 'changes/a-change.yaml', line: 4, rule: 'change-no-record', message: '`update` names `apps/app-apy`, but no record has that id. The nearest id is `app-api`.' })] });
  // A file that does not read is faulted at itself.
  const unread = applyChange([...SHOP, { path: 'changes/a-change.yaml', text: 'name: A change\nprompt: Make it: so.\n' }], 'a-change');
  expect('faults' in unread && unread.faults.map((problem) => problem.rule)).toEqual(['yaml-syntax']);
  expect(applyChange(withChange('status: applied\nremove:\n  - stores/store-old\n'), 'a-change')).toEqual({ refusals: ['`changes/a-change` is applied already.'], faults: [] });
  expect(applyChange(withChange('status: rejected\nwhy: Not now.\nremove:\n  - stores/store-old\n'), 'a-change')).toEqual({
    refusals: ['`changes/a-change` is rejected. To open it again, take `status` and `why` out of its file.'],
    faults: [],
  });
  expect(applyChange(withChange('given:\n  - The old store goes.\n'), 'a-change')).toEqual({ refusals: ['`changes/a-change` has no `add`, `update` or `remove`: there is nothing to apply.'], faults: [] });
  // A change is named by its id, and may be named by its path.
  expect(applyChange(withChange(''), 'a-chang')).toEqual({ refusals: ['There is no change `a-chang`. The nearest is `a-change`.'], faults: [] });
  expect(applyChange(withChange(''), 'another')).toEqual({ refusals: ['There is no change `another`. The changes are `a-change`.'], faults: [] });
  expect(applyChange(SHOP, 'another')).toEqual({ refusals: ['There is no change `another`. There are no changes.'], faults: [] });
  expect(applyChange(withChange('remove:\n  - stores/store-old\n'), 'changes/a-change.yaml')).toHaveProperty('gone', ['stores/store-old.yaml']);
});

test('it says what waits and what is wrong elsewhere, and applies all the same', () => {
  const point = (status: string, severity = 'block') => [`    severity: ${severity}`, '    about: [need]', '    finding: Something is not right.', ...(status === 'open' ? [] : [`    status: ${status}`, '    comments:', '      - Said why.'])];
  const review = file('reviews/a-change', 'read: "3f9a0c21"', 'points:', ...['open', 'fixed', 'declined', 'reopened', 'closed'].flatMap((status) => [`  point-${status}:`, `    name: A point that is ${status}`, ...point(status)]), '  point-note:', '    name: A note', ...point('open', 'note'));
  const model = [
    ...SHOP,
    review,
    file('stores/store-broken', 'name: Pg: the database', 'in: system-shop'),
    file('rules/rule-orders-by-the-api', 'name: The orders are written only by the API', 'each: {to: {id: store-orders}, access: [write, read-write]}', 'must: {from: {id: app-api}}'),
    // Another open change: it adds the same record, and writes the same key otherwise.
    file('changes/other', 'name: Other', 'prompt: Make it otherwise.', 'add:', '  apps/app-worker:', '    name: Worker', '    in: system-shop', 'update:', '  systems/system-shop:', '    description: Sells things in shops.'),
  ];
  const body = 'add:\n  apps/app-worker:\n    name: Worker\n    in: system-shop\nupdate:\n  systems/system-shop:\n    description: Sells things online and by post.\n';
  const done = applied(withChange(body, model));
  expect(done.warnings.map((problem) => [problem.rule, problem.line])).toEqual([['change-same-key', 9]]);
  expect(done.said).toEqual([
    'Review: 1 block open, 1 fixed and not read again, 2 wait for the person.',
    'The model has 1 error of its own: `seefore check` lists it.',
    'With them, no rule of `rules/` was judged with this change.',
    'The check now faults `changes/other`: 1 error.',
  ]);
  expect(written(done, 'systems/system-shop.yaml')).toBe('name: Shop\ndescription: Sells things online and by post.\n');
  // With no review, and nothing wrong elsewhere, it says that there is no review and no more.
  expect(applied(withChange(body)).said).toEqual(['Review: none.']);
  expect(applied(withChange(body, [...SHOP, file('reviews/a-change', 'read: "3f9a0c21"', 'points:', '  point-note:', '    name: A note', ...point('open', 'note'))])).said).toEqual(['Review: nothing open.']);
});

test('a record in braces and a file with carriage returns are written by the library, which is said of a file that was there; a file with no line break at its end gets one', () => {
  const body = 'add:\n  apps/app-worker: {name: Worker, in: system-shop}\nupdate:\n  apps/app-api: {name: Order API}\n  systems/system-shop:\n    name: The shop\n  people/person-customer:\n    description: Buys things.\n';
  const model = SHOP.map((each) =>
    each.path === 'systems/system-shop.yaml' ? { ...each, text: each.text.replaceAll('\n', '\r\n') } : each.path === 'people/person-customer.yaml' ? { ...each, text: each.text.trimEnd() } : each,
  );
  const files = withChange(body, model);
  const done = applied(files);
  expect(done.whole).toEqual(['apps/app-worker.yaml', 'apps/app-api.yaml', 'systems/system-shop.yaml']);
  expect(done.said).toEqual([
    'Review: none.',
    "`apps/app-api.yaml` is written anew, since its lines could not be moved: its layout is the library's.",
    "`systems/system-shop.yaml` is written anew, since its lines could not be moved: its layout is the library's.",
  ]);
  expect(written(done, 'apps/app-worker.yaml')).toBe('name: Worker\nin: system-shop\n');
  // The library writes a whole file: the folded text is unfolded.
  expect(written(done, 'apps/app-api.yaml')).toBe('name: Order API\nin: system-shop\ndescription: Takes the orders and keeps them.\nkind: service\ntechnology:\n  - tech-go\n');
  expect(written(done, 'systems/system-shop.yaml')).toBe('name: The shop\ndescription: Sells things online.\n');
  expect(written(done, 'people/person-customer.yaml')).toBe('name: Customer\ndescription: Buys things.\n');
  // Each reads back as the check laid it.
  const laid = readModel(files).laid[0]?.records ?? [];
  expect(laid).toHaveLength(4);
  for (const record of laid) expect(done.after.records.find((each) => each.file === record.file)?.fields).toEqual(record.fields);
});

test('the example change of the guide applies, and the check is clean afterwards with the change decided', () => {
  const files = [{ path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' }, ...Object.values(EXAMPLES).map((example) => ({ path: example.path, text: `${example.text}\n` }))];
  const done = applied(files, 'copies-for-accounts');
  expect(done.lines).toEqual(['+ stores/store-order-copies', '+ connections/connection-api-writes-copies', '~ apps/app-order-api: description']);
  expect(done.warnings).toEqual([]);
  expect(done.said).toEqual(['Review: 1 block waits for the person.']);
  expect(done.whole).toEqual([]);
  expect(written(done, 'apps/app-order-api.yaml')).toBe('name: Order API\nin: system-shop\nkind: service\ndescription: Takes the orders that customers place, keeps them, and copies them each night.\n');
  expect(written(done, 'stores/store-order-copies.yaml')).toBe('name: Order copies\nin: system-shop\nkind: files\ndescription: A copy of each order, written once a night for the accounts.\n');
  // The model as it is afterwards is the one the files give, with no problem, and the change is laid no more.
  const after = readModel([...files.filter((each) => !done.written.some((one) => one.path === each.path) && each.path !== done.change.path), ...done.written, done.change]);
  expect(after).toEqual(done.after);
  expect(after.problems).toEqual([]);
  expect(after.laid).toEqual([]);
  expect(after.records.find((each) => each.kind === 'changes')?.fields.status).toBe('applied');
});
