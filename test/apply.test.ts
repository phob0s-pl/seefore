import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { applyChange } from '../src/model/apply.ts';
import type { Applied } from '../src/model/apply.ts';
import { catalogueOf } from '../src/model/catalogue.ts';
import { EXAMPLES } from '../src/model/guide.ts';
import { changeMark } from '../src/model/mark.ts';
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
/** The mark of the change whose body is the text given: what a review that read it as it is bears in `read`. */
const markOf = (body: string): string => changeMark(parse(`name: A change\nprompt: Make it so.\n${body}`));

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

test('an apply names the files of the records it adds, which must be new, and no other file it writes or takes away', () => {
  const done = applied(withChange('add:\n  apps/app-worker: {name: Worker, in: system-shop}\n  technologies/tech-redis: {name: Redis}\nupdate:\n  systems/system-shop: {description: Sells things.}\nremove:\n  - stores/store-old\n'));
  expect(done.fresh).toEqual(['apps/app-worker.yaml', 'technologies/tech-redis.yaml']);
  expect(done.written.map((each) => each.path)).toEqual(['apps/app-worker.yaml', 'technologies/tech-redis.yaml', 'systems/system-shop.yaml']);
  expect(done.gone).toEqual(['stores/store-old.yaml']);
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

test('a change that adds a repository and an app that names it, and names it on a system, is laid and applied, each key at its place', () => {
  const body = [
    'add:',
    '  repositories/repo-worker:',
    '    name: worker',
    '    url: https://example.org/tea/worker',
    '    workspace: true',
    '  apps/app-worker:',
    '    name: Worker',
    '    in: system-shop',
    '    repository: repo-worker',
    'update:',
    '  systems/system-shop:',
    '    repository: repo-worker',
    '',
  ].join('\n');
  const files = withChange(body);
  const read = readModel(files);
  expect(read.problems).toEqual([]);
  expect(read.laid.map((laid) => [laid.change, laid.records.map((record) => `${record.kind}/${record.id}`)])).toEqual([['a-change', ['apps/app-worker', 'repositories/repo-worker', 'systems/system-shop']]]);
  const done = applied(files);
  expect(done.lines).toEqual(['+ repositories/repo-worker', '+ apps/app-worker', '~ systems/system-shop: repository']);
  expect(written(done, 'repositories/repo-worker.yaml')).toBe('name: worker\nurl: https://example.org/tea/worker\nworkspace: true\n');
  expect(written(done, 'apps/app-worker.yaml')).toBe('name: Worker\nin: system-shop\nrepository: repo-worker\n');
  expect(written(done, 'systems/system-shop.yaml')).toBe('name: Shop\ndescription: Sells things online.\nrepository: repo-worker\n');
  expect(done.after.problems).toEqual([]);
  // A key that names no repository is held as any id the change names.
  const wrong = readModel(withChange('add:\n  apps/app-worker: {name: Worker, in: system-shop, repository: repo-nowhere}\n')).problems;
  expect(wrong.map((problem) => [problem.file, problem.rule, problem.message])).toEqual([['changes/a-change.yaml', 'reference-unknown', 'With this change, `apps/app-worker`: `repository` names `repo-nowhere`, but no record has that id.']]);
});

test("a change that updates a repository's own keys and takes an app's `repository` out with `null` is applied, and the app takes its system's", () => {
  const model = [
    ...SHOP.filter((each) => each.path !== 'systems/system-shop.yaml' && each.path !== 'apps/app-api.yaml'),
    file('systems/system-shop', 'name: Shop', 'description: Sells things online.', 'repository: repo-shop'),
    file('apps/app-api', 'name: API', 'in: system-shop', 'kind: service', 'technology:', '  - tech-go', 'repository: repo-api'),
    file('repositories/repo-shop', 'name: shop'),
    file('repositories/repo-api', 'name: api', 'url: https://example.org/tea/api'),
  ];
  expect(readModel(model).problems).toEqual([]);
  const body = ['update:', '  repositories/repo-shop:', '    url: git@example.org:tea/shop.git', '    workspace: true', '  apps/app-api:', '    repository: null', ''].join('\n');
  const done = applied(withChange(body, model));
  expect(done.lines).toEqual(['~ repositories/repo-shop: url, workspace', '~ apps/app-api: repository']);
  expect(written(done, 'repositories/repo-shop.yaml')).toBe('name: shop\nurl: git@example.org:tea/shop.git\nworkspace: true\n');
  expect(written(done, 'apps/app-api.yaml')).toBe('name: API\nin: system-shop\nkind: service\ntechnology:\n  - tech-go\n');
  expect(done.after.problems).toEqual([]);
  // The repository no part names is no fault, and the app's code is now in its system's.
  expect(catalogueOf(done.after.records).repository('app-api')).toEqual({ id: 'repo-shop', from: 'system-shop' });
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

/** The keys of a point under its name, in a status: a recommendation when it is a block, and the comments its status has had. */
const point = (status: string, severity = 'block') => [
  `    severity: ${severity}`,
  '    about: [need]',
  '    finding: Something is not right.',
  ...(severity === 'block' ? ['    recommendation: Something is right.'] : []),
  ...(status === 'open' ? [] : [`    status: ${status}`, '    comments:', '      - Said why.', ...(status === 'reopened' ? ['      - Said what is still open.'] : [])]),
];

test('it says what waits and what is wrong elsewhere, and applies all the same', () => {
  const body = 'add:\n  apps/app-worker:\n    name: Worker\n    in: system-shop\nupdate:\n  systems/system-shop:\n    description: Sells things online and by post.\n';
  const review = file('reviews/a-change', `read: "${markOf(body)}"`, 'points:', ...['open', 'fixed', 'declined', 'reopened', 'closed'].flatMap((status) => [`  point-${status}:`, `    name: A point that is ${status}`, ...point(status)]), '  point-note:', '    name: A note', ...point('open', 'note'));
  const model = [
    ...SHOP,
    review,
    file('stores/store-broken', 'name: Pg: the database', 'in: system-shop'),
    file('rules/rule-orders-by-the-api', 'name: The orders are written only by the API', 'each: {to: {id: store-orders}, access: [write, read-write]}', 'must: {from: {id: app-api}}'),
    // Another open change: it adds the same record, and writes the same key otherwise.
    file('changes/other', 'name: Other', 'prompt: Make it otherwise.', 'add:', '  apps/app-worker:', '    name: Worker', '    in: system-shop', 'update:', '  systems/system-shop:', '    description: Sells things in shops.'),
  ];
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
  expect(applied(withChange(body, [...SHOP, file('reviews/a-change', `read: "${markOf(body)}"`, 'points:', '  point-note:', '    name: A note', ...point('open', 'note'))])).said).toEqual(['Review: nothing open.']);
});

test('a fixed note is fixed and not read again, as a fixed block is; the word "block" goes with the first count of blocks, and a note that is open or declined waits for nobody', () => {
  const body = 'remove:\n  - stores/store-old\n';
  /** What it says of a review whose points are in these statuses, each with its severity. */
  const said = (...points: [string, string][]) =>
    applied(withChange(body, [...SHOP, file('reviews/a-change', `read: "${markOf(body)}"`, 'points:', ...points.flatMap(([status, severity], index) => [`  point-${index}:`, `    name: Point ${index}`, ...point(status, severity)]))])).said;
  expect(said(['fixed', 'note'])).toEqual(['Review: 1 fixed and not read again.']);
  expect(said(['fixed', 'note'], ['fixed', 'block'], ['declined', 'block'])).toEqual(['Review: 2 fixed and not read again, 1 block waits for the person.']);
  expect(said(['open', 'block'], ['fixed', 'note'])).toEqual(['Review: 1 block open, 1 fixed and not read again.']);
  expect(said(['open', 'note'], ['declined', 'note'], ['closed', 'block'])).toEqual(['Review: nothing open.']);
});

test('it says when the review read the change before it moved, after its line of the review', () => {
  const body = 'remove:\n  - stores/store-old\n';
  expect(applied(withChange(body, [...SHOP, file('reviews/a-change', 'read: "3f9a0c21"')])).said).toEqual(['Review: nothing open.', `The review read the change as \`3f9a0c21\`; it is \`${markOf(body)}\` now.`]);
  // A review that read the change as it is says no more.
  expect(applied(withChange(body, [...SHOP, file('reviews/a-change', `read: "${markOf(body)}"`)])).said).toEqual(['Review: nothing open.']);
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
