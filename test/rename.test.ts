import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { changeMark } from '../src/model/mark.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';
import { removeRecords } from '../src/model/remove.ts';
import { readRenames, renameRecords } from '../src/model/rename.ts';
import type { Rename, Renamed } from '../src/model/rename.ts';

const MARKER: SourceFile = { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' };
const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
const lines = (...written: string[]): string => `${written.join('\n')}\n`;
const pairs = (...written: string[]): Rename[] => written.map((line) => ({ old: line.split(' ')[0] as string, new: line.split(' ')[1] as string }));

/** A rename that must be done: its files and account, or the test fails with the refusals. */
function renamed(files: readonly SourceFile[], ...written: string[]): Renamed {
  const done = renameRecords(files, pairs(...written));
  if ('refusals' in done) throw new Error(done.refusals.join('\n'));
  return done;
}
/** The refusals of a rename that must be refused. */
function refused(files: readonly SourceFile[], ...written: string[]): string[] {
  const done = renameRecords(files, pairs(...written));
  if (!('refusals' in done)) throw new Error(`renamed: ${JSON.stringify(done.account)}`);
  return done.refusals;
}
const textAt = (files: readonly SourceFile[], path: string): string | undefined => files.find((each) => each.path === path)?.text;
/** Every problem of a model, in one line each, so that a failing test says what is wrong. */
const problems = (files: readonly SourceFile[]): string[] => readModel(files).problems.map((problem) => `${problem.file}:${problem.line}: ${problem.rule}: ${problem.message}`);
/** The files that still name an id as a whole word, anywhere in their text. */
const naming = (files: readonly SourceFile[], id: string): string[] => files.filter((each) => new RegExp(`(?<![a-z0-9-])${id}(?![a-z0-9-])`).test(each.text)).map((each) => each.path);

/** A shop with a record of every kind, and every field that names one. */
const SHOP: SourceFile[] = [
  MARKER,
  file('people/person-customer', 'name: Customer\n'),
  file('systems/system-shop', 'name: Shop\nowner: owner-team\n'),
  file('owners/owner-team', 'name: The shop team\n'),
  file('technologies/tech-go', 'name: Go\n'),
  file('apps/app-api', 'name: API\nin: system-shop\nowner: owner-team\ntechnology: [tech-go]\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('components/component-checkout', 'name: Checkout\nin: app-api\n'),
  file('infrastructure/infra-proxy', 'name: Proxy\nin: system-shop\n'),
  file('connections/connection-customer-calls-api', 'from: person-customer\nto: app-api\nvia: [infra-proxy]\nname: Places an order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\ntechnology:\n  - tech-go\n'),
  file('features/feature-ordering', 'name: Ordering\nowner: owner-team\ntouches: [app-api, connection-api-writes-orders]\n'),
  file('data/data-order', 'name: Order\n'),
  file(
    'flows/flow-placing',
    lines(
      'name: Placing an order',
      'starts: A customer orders',
      'ends: The order is kept',
      'feature: feature-ordering',
      'steps:',
      '  - {id: places, does: connection-customer-calls-api, data: [data-order]}',
      '  - id: saves',
      '    does: connection-api-writes-orders',
      '    data:',
      '      - data-order',
      '  - {id: confirms, reply: places, name: Confirms the order}',
    ),
  ),
  file(
    'flows/flow-reordering',
    lines('name: Ordering again', 'starts: A customer orders again', 'ends: The order is kept', 'feature: feature-ordering', 'steps:', '  - {id: checks, does: app-api, name: Finds the last order}', '  - {id: places, does: flow-placing}'),
  ),
  file('context/context-orders-kept', 'system: system-shop\nmust: An order is never lost.\nwhy: It is what the shop promises.\n'),
  file(
    'rules/rule-orders-by-the-api',
    lines('name: The orders are written only by the API', 'each: {to: {id: store-orders}, data: [data-order]}', 'must: {from: {id: app-api, technology: tech-go, owner: owner-team}}'),
  ),
  file('rules/rule-checkout-elsewhere', lines('name: Checkout is not in the shop', 'never: {id: component-checkout, within: system-shop}', 'debt: [component-checkout]')),
];

test('every place the table names is rewritten, and the check is clean after', () => {
  expect(problems(SHOP)).toEqual([]);
  const list = [
    'person-customer person-buyer',
    'system-shop system-webshop',
    'app-api app-backend',
    'store-orders store-orderbook',
    'infra-proxy infra-gateway',
    'owner-team owner-shop-team',
    'tech-go tech-golang',
    'feature-ordering feature-buying',
    'data-order data-purchase',
    'connection-api-writes-orders connection-backend-saves',
    'flow-placing flow-buying',
    'component-checkout component-till',
    'context-orders-kept context-orders-safe',
    'rule-checkout-elsewhere rule-till-elsewhere',
  ];
  const done = renamed(SHOP, ...list);
  expect(problems(done.files)).toEqual([]);
  expect(readModel(done.files).records).toHaveLength(readModel(SHOP).records.length);
  // The connection that names both its ends in its id follows them.
  expect(done.account.renamed).toContainEqual({ old: 'connection-customer-calls-api', new: 'connection-buyer-calls-backend', follows: 'person-customer and app-api' });
  for (const old of [...list.map((line) => line.split(' ')[0] as string), 'connection-customer-calls-api']) expect(naming(done.files, old)).toEqual([]);
  expect(done.files.map((each) => each.path).sort()).toEqual(
    [
      'seefore.yaml',
      'people/person-buyer.yaml',
      'systems/system-webshop.yaml',
      'owners/owner-shop-team.yaml',
      'technologies/tech-golang.yaml',
      'apps/app-backend.yaml',
      'stores/store-orderbook.yaml',
      'components/component-till.yaml',
      'infrastructure/infra-gateway.yaml',
      'connections/connection-buyer-calls-backend.yaml',
      'connections/connection-backend-saves.yaml',
      'features/feature-buying.yaml',
      'data/data-purchase.yaml',
      'flows/flow-buying.yaml',
      'flows/flow-reordering.yaml',
      'context/context-orders-safe.yaml',
      'rules/rule-orders-by-the-api.yaml',
      'rules/rule-till-elsewhere.yaml',
    ].sort(),
  );
  expect(textAt(done.files, 'rules/rule-orders-by-the-api.yaml')).toBe(
    lines('name: The orders are written only by the API', 'each: {to: {id: store-orderbook}, data: [data-purchase]}', 'must: {from: {id: app-backend, technology: tech-golang, owner: owner-shop-team}}'),
  );
  expect(done.account.files).toContainEqual({ from: 'flows/flow-placing.yaml', to: 'flows/flow-buying.yaml', places: 5 });
  expect(done.account.files).toContainEqual({ from: 'flows/flow-reordering.yaml', to: 'flows/flow-reordering.yaml', places: 3 });
  expect(done.account.files).not.toContainEqual(expect.objectContaining({ from: 'seefore.yaml' }));
});

test("only the id's own characters change: comments, quotes, layout and line ends stay to the letter", () => {
  const model = [
    MARKER,
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('apps/app-api-gateway', 'name: Gateway\nin: system-shop\n'),
    file('components/component-checkout', 'name: Checkout\r\nin: app-api\r\ndescription: Runs inside app-api.\r\n'),
    file(
      'connections/connection-api-writes-orders',
      lines('# Where the API keeps an order.', 'from: "app-api"   # the one that writes', '', "to: 'store-orders'", 'via: [ app-api-gateway ,app-api ]', 'name: Saves the order, as app-api does'),
    ),
    file('features/feature-ordering', lines('name: Ordering', 'touches:', '  - app-api', "  - 'app-api-gateway'", '', '  - connection-api-writes-orders')),
    file('rules/rule-orders', lines('each: {to: {id: [store-orders, app-api]}}', 'name: Orders', 'must:', '  from: {id: app-api}')),
  ];
  const done = renamed(model, 'app-api app-backend');
  expect(textAt(done.files, 'components/component-checkout.yaml')).toBe('name: Checkout\r\nin: app-backend\r\ndescription: Runs inside app-api.\r\n');
  expect(textAt(done.files, 'connections/connection-backend-writes-orders.yaml')).toBe(
    lines('# Where the API keeps an order.', 'from: "app-backend"   # the one that writes', '', "to: 'store-orders'", 'via: [ app-api-gateway ,app-backend ]', 'name: Saves the order, as app-api does'),
  );
  expect(textAt(done.files, 'features/feature-ordering.yaml')).toBe(lines('name: Ordering', 'touches:', '  - app-backend', "  - 'app-api-gateway'", '', '  - connection-backend-writes-orders'));
  expect(textAt(done.files, 'rules/rule-orders.yaml')).toBe(lines('each: {to: {id: [store-orders, app-backend]}}', 'name: Orders', 'must:', '  from: {id: app-backend}'));
  expect(textAt(done.files, 'apps/app-backend.yaml')).toBe('name: API\nin: system-shop\n');
  expect(textAt(done.files, 'apps/app-api-gateway.yaml')).toBe('name: Gateway\nin: system-shop\n');
});

/** A change that adds, updates and removes. */
const ORDERS_BY_POST = lines(
  'name: Orders by post',
  'prompt: The clerk types in the orders that come by post.',
  'add:',
  '  connections/connection-clerk-types-in:',
  '    from: person-clerk',
  '    to: app-api',
  '    name: Types in a posted order',
  'update:',
  '  apps/app-api:',
  '    description: Takes the orders.',
  '  flows/flow-placing:',
  '    steps:',
  '      - app-api',
  '      - {id: types-in, does: connection-clerk-types-in, name: Types the order in}',
  '      - saves',
  'remove:',
  '  - people/person-courier',
);
/** A shop with that change, and a review that read it as it is. */
const CHANGED: SourceFile[] = [
  MARKER,
  file('systems/system-shop', 'name: Shop\n'),
  file('apps/app-api', 'name: API\nin: system-shop\nkind: service\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('people/person-clerk', 'name: Clerk\n'),
  file('people/person-courier', 'name: Courier\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\nname: Saves the order\n'),
  file('features/feature-ordering', 'name: Ordering\n'),
  // The first step has the id of the app it happens in: a bare word in a change's steps names the step.
  file(
    'flows/flow-placing',
    lines('name: Placing an order', 'starts: A customer orders', 'ends: The order is kept', 'feature: feature-ordering', 'steps:', '  - {id: app-api, does: app-api, name: Checks the stock}', '  - {id: saves, does: connection-api-writes-orders}'),
  ),
  file('changes/orders-by-post', ORDERS_BY_POST),
  file(
    'reviews/orders-by-post',
    lines(
      `read: "${changeMark(parse(ORDERS_BY_POST))}"`,
      'points:',
      '  clerk-sees-nothing:',
      '    name: The clerk cannot see an order',
      '    severity: note',
      '    about: [connections/connection-clerk-types-in, flows/flow-placing#types-in, need]',
      '    finding: The connection `connection-clerk-types-in` is the only one of the clerk.',
      '  api-says-little:',
      '    name: The API says little',
      '    severity: note',
      '    about:',
      '      - apps/app-api',
      '    finding: Its description is short.',
    ),
  ),
];

test("a change's paths and fields, and a review's addresses, are rewritten; an id only a change adds is renamed too", () => {
  expect(problems(CHANGED)).toEqual([]);
  const done = renamed(CHANGED, 'app-api app-backend', 'connections/connection-clerk-types-in connection-clerk-keys-in', 'person-courier person-messenger', 'flow-placing flow-buying');
  // The rename rewrites the change, so the review read it as it was: that alone is told.
  const [was, now] = [ORDERS_BY_POST, textAt(done.files, 'changes/orders-by-post.yaml') as string].map((text) => changeMark(parse(text)));
  expect(problems(done.files)).toEqual([`reviews/orders-by-post.yaml:1: review-behind: \`read\` is \`${was}\`, and the change is \`${now}\` now: it moved after this reading.`]);
  expect(textAt(done.files, 'changes/orders-by-post.yaml')).toBe(
    lines(
      'name: Orders by post',
      'prompt: The clerk types in the orders that come by post.',
      'add:',
      '  connections/connection-clerk-keys-in:',
      '    from: person-clerk',
      '    to: app-backend',
      '    name: Types in a posted order',
      'update:',
      '  apps/app-backend:',
      '    description: Takes the orders.',
      '  flows/flow-buying:',
      '    steps:',
      '      - app-api',
      '      - {id: types-in, does: connection-clerk-keys-in, name: Types the order in}',
      '      - saves',
      'remove:',
      '  - people/person-messenger',
    ),
  );
  expect(textAt(done.files, 'flows/flow-buying.yaml')).toContain('  - {id: app-api, does: app-backend, name: Checks the stock}');
  expect(textAt(done.files, 'reviews/orders-by-post.yaml')).toContain('    about: [connections/connection-clerk-keys-in, flows/flow-buying#types-in, need]');
  expect(textAt(done.files, 'reviews/orders-by-post.yaml')).toContain('      - apps/app-backend\n');
  // Prose is left, and each line where an old id stands in backticks is told.
  expect(done.account.prose).toEqual([{ file: 'reviews/orders-by-post.yaml', line: 7, text: 'finding: The connection `connection-clerk-types-in` is the only one of the clerk.' }]);
  // The connection the app writes with follows it; the one only the change adds has no file to move.
  expect(done.account.renamed).toContainEqual({ old: 'connection-api-writes-orders', new: 'connection-backend-writes-orders', follows: 'app-api' });
  expect(done.account.files.map((each) => `${each.from} ${each.to} ${each.places}`)).toEqual([
    'apps/app-api.yaml apps/app-backend.yaml 0',
    'changes/orders-by-post.yaml changes/orders-by-post.yaml 6',
    'connections/connection-api-writes-orders.yaml connections/connection-backend-writes-orders.yaml 1',
    'flows/flow-placing.yaml flows/flow-buying.yaml 2',
    'people/person-courier.yaml people/person-messenger.yaml 0',
    'reviews/orders-by-post.yaml reviews/orders-by-post.yaml 3',
  ]);
});

test('a repository is renamed where a system, an app and a change name it, and is not removed while one names it', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\nrepository: repo-shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\nrepository: "repo-shop"\n'),
    file('repositories/repo-shop', 'name: shop\nworkspace: true\n'),
    file('repositories/repo-deploy', 'name: deploy\n'),
    file('changes/a-worker', 'name: A worker\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop, repository: repo-shop}\nupdate:\n  repositories/repo-shop: {url: https://example.org/tea/shop}\n'),
  ];
  expect(problems(model)).toEqual([]);
  const done = renamed(model, 'repo-shop repo-tea-shop');
  expect(textAt(done.files, 'repositories/repo-tea-shop.yaml')).toBe('name: shop\nworkspace: true\n');
  expect(textAt(done.files, 'systems/system-shop.yaml')).toBe('name: Shop\nrepository: repo-tea-shop\n');
  expect(textAt(done.files, 'apps/app-api.yaml')).toBe('name: API\nin: system-shop\nrepository: "repo-tea-shop"\n');
  expect(textAt(done.files, 'changes/a-worker.yaml')).toBe('name: A worker\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop, repository: repo-tea-shop}\nupdate:\n  repositories/repo-tea-shop: {url: https://example.org/tea/shop}\n');
  expect(problems(done.files)).toEqual([]);
  // Removed alone while a part names it, it stays; one that nothing names goes.
  const today = model.filter((each) => !each.path.startsWith('changes/'));
  expect(removeRecords(today, ['repo-shop'])).toEqual({ refusals: ['`repo-shop` stays: apps/app-api.yaml:3:13 names it', '`repo-shop` stays: systems/system-shop.yaml:2:13 names it', 'remove what names it in the same call, or change it first'] });
  expect(removeRecords(today, ['repo-shop', 'system-shop', 'app-api'])).toEqual({ files: ['apps/app-api.yaml', 'repositories/repo-shop.yaml', 'systems/system-shop.yaml'] });
  expect(removeRecords(today, ['repo-deploy'])).toEqual({ files: ['repositories/repo-deploy.yaml'] });
});

test("an id in a step's `removes` is renamed, and a data record that a step names there alone is not removed", () => {
  const taking = (step: string) => file('flows/flow-taking', lines('name: Taking a job', 'starts: A job waits', 'ends: It is done', 'feature: feature-jobs', 'steps:', step));
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('stores/store-jobs', 'name: Jobs\nin: system-shop\nkind: queue\n'),
    file('connections/connection-api-takes-jobs', 'from: app-api\nto: store-jobs\naccess: read\nname: Takes a job\n'),
    file('features/feature-jobs', 'name: Jobs\n'),
    file('data/data-job', 'name: Job\n'),
    taking('  - {id: takes, does: connection-api-takes-jobs, data: [data-job], removes: [data-job]}'),
  ];
  expect(problems(model)).toEqual([]);
  const done = renamed(model, 'data-job data-task');
  expect(textAt(done.files, 'flows/flow-taking.yaml')).toContain('\n  - {id: takes, does: connection-api-takes-jobs, data: [data-task], removes: [data-task]}\n');
  expect(problems(done.files)).toEqual([]);
  const alone = [...model.slice(0, -1), taking('  - {id: takes, does: connection-api-takes-jobs, removes: [data-job]}')];
  expect(problems(alone)).toEqual([]);
  expect(removeRecords(alone, ['data-job'])).toEqual({ refusals: ['`data-job` stays: flows/flow-taking.yaml:6:60 names it', 'remove what names it in the same call, or change it first'] });
});

test('while a mistyped id leaves the rules unjudged, a removal is held against them all the same, and a break that was there is not laid on it', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('apps/app-worker', 'name: Worker\nin: system-shop\n'),
    file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
    file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\n'),
    file('connections/connection-worker-writes-orders', 'from: app-worker\nto: store-orders\naccess: write\n'),
    file('connections/connection-worker-calls-api', 'from: app-worker\nto: app-apii\n'),
    file('rules/rule-only-api', 'name: Only the API writes the orders\neach: {to: {id: store-orders}, access: [write, read-write]}\nmust: {from: {id: app-api}}\n'),
    file('rules/rule-written', 'name: Every database is written by the API\neach: {kind: database}\nmust: {connection: {from: {id: app-api}, access: write}}\n'),
  ];
  // The check tells the mistyped id alone: the worker's write breaks a rule, which is not said while no rule is judged.
  expect(problems(model)).toEqual(['connections/connection-worker-calls-api.yaml:2: reference-unknown: `to` names `app-apii`, but no record has that id. The nearest id is `app-api`.']);
  expect(readModel(model).rulings.map((ruling) => ruling.state)).toEqual(['not-judged', 'not-judged']);
  // The record with the mistyped id goes, though the rules are judged once it has gone and one is broken then.
  expect(removeRecords(model, ['connection-worker-calls-api'])).toEqual({ files: ['connections/connection-worker-calls-api.yaml'] });
  expect(problems(model.filter((each) => each.path !== 'connections/connection-worker-calls-api.yaml')).map((line) => line.split(': ')[1])).toEqual(['rules/rule-only-api']);
  // A removal that breaks a rule anew is refused, while the id is still mistyped.
  expect(removeRecords(model, ['connection-api-writes-orders'])).toEqual({
    refusals: ['stores/store-orders.yaml:1:1: `store-orders` breaks the rule `rule-written`: Every database is written by the API.', 'remove what names it in the same call, or change it first'],
  });
});

test('a new word moves the file to its folder, its text as it was', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('people/person-bank', 'name: The bank\ndescription: Takes the payments.\n'),
    file('connections/connection-api-pays-bank', 'from: app-api\nto: person-bank\nname: Pays\n'),
  ];
  const done = renamed(model, 'person-bank system-bank');
  expect(textAt(done.files, 'people/person-bank.yaml')).toBeUndefined();
  expect(textAt(done.files, 'systems/system-bank.yaml')).toBe('name: The bank\ndescription: Takes the payments.\n');
  // The part of the id after its word stays, so the connection keeps its id.
  expect(textAt(done.files, 'connections/connection-api-pays-bank.yaml')).toBe('from: app-api\nto: system-bank\nname: Pays\n');
  expect(done.account.files).toEqual([
    { from: 'connections/connection-api-pays-bank.yaml', to: 'connections/connection-api-pays-bank.yaml', places: 1 },
    { from: 'people/person-bank.yaml', to: 'systems/system-bank.yaml', places: 0 },
  ]);
  expect(problems(done.files)).toEqual([]);
});

test('a connection follows its end, unless the list renames it, its new id is taken or it is too long', () => {
  const long = `connection-puma-${'a'.repeat(60)}`;
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-puma', 'name: Puma\nin: system-shop\n'),
    file('apps/app-other', 'name: Other\nin: system-shop\n'),
    file('stores/store-redis', 'name: Redis\nin: system-shop\nkind: cache\n'),
    file('connections/connection-puma-caches-in-redis', 'from: app-puma\nto: store-redis\nname: Caches\n'),
    file('connections/connection-redis-feeds-puma', 'from: store-redis\nto: app-puma\nname: Feeds\n'),
    file('connections/connection-puma-reads-redis', 'from: app-puma\nto: store-redis\naccess: read\nname: Reads\n'),
    file('connections/connection-webservice-reads-redis', 'from: app-other\nto: store-redis\naccess: read\nname: Reads too\n'),
    file('connections/connection-puma-logs', 'from: app-puma\nto: app-other\nname: Logs\n'),
    file(`connections/${long}`, 'from: app-puma\nto: app-other\nname: Says a lot\n'),
    file('features/feature-caching', 'name: Caching\n'),
    file(
      'flows/flow-caching',
      lines('name: Caching a page', 'starts: A page is asked for', 'ends: The page is kept', 'feature: feature-caching', 'steps:', '  - {id: caches, does: connection-puma-caches-in-redis}'),
    ),
  ];
  const done = renamed(model, 'app-puma app-webservice', 'connection-puma-logs connection-puma-logs-out');
  expect(done.account.renamed).toEqual([
    { old: 'app-puma', new: 'app-webservice' },
    { old: 'connection-puma-logs', new: 'connection-puma-logs-out' },
    { old: 'connection-puma-caches-in-redis', new: 'connection-webservice-caches-in-redis', follows: 'app-puma' },
    { old: 'connection-redis-feeds-puma', new: 'connection-redis-feeds-webservice', follows: 'app-puma' },
  ]);
  expect(done.account.left).toEqual([
    { id: long, would: `connection-webservice-${'a'.repeat(60)}`, why: 'it would have 82 characters, and an id has at most 80' },
    { id: 'connection-puma-reads-redis', would: 'connection-webservice-reads-redis', why: '`connection-webservice-reads-redis` is taken' },
  ]);
  expect(textAt(done.files, 'flows/flow-caching.yaml')).toContain('  - {id: caches, does: connection-webservice-caches-in-redis}');
  expect(textAt(done.files, 'connections/connection-webservice-caches-in-redis.yaml')).toBe('from: app-webservice\nto: store-redis\nname: Caches\n');
  expect(textAt(done.files, 'connections/connection-puma-reads-redis.yaml')).toBe('from: app-webservice\nto: store-redis\naccess: read\nname: Reads\n');
  expect(problems(done.files)).toEqual([]);
});

test('each refusal says what to do, and nothing is done', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('stores/store-orders', 'name: Orders\nin: system-shop\n'),
    file('apps/data-order', 'name: Order app\nin: system-shop\n'),
    file('data/data-order', 'name: Order\n'),
    file('changes/orders-by-post', 'name: Orders by post\nprompt: Orders come by post.\n'),
  ];
  const before = JSON.stringify(model);
  expect(refused(model, 'app-apu app-backend')).toEqual(['`app-apu` names no record: no file of the model has that id, and no change adds it. The nearest id is `app-api`.']);
  expect(refused(model, 'data-order data-purchase')).toEqual(['`data-order` is the id of 2 records: `apps/data-order.yaml` and `data/data-order.yaml`. Say which one, as `apps/data-order`.']);
  expect(renameRecords(model, pairs('data/data-order data-purchase'))).not.toHaveProperty('refusals');
  expect(refused(model, 'orders-by-post app-post')).toEqual(['`orders-by-post` names a change. `rename` renames records of the model; a change and its review keep their id.']);
  expect(refused(model, 'changes/orders-by-post app-post')).toHaveLength(1);
  expect(refused(model, 'app-api App-Backend')).toEqual(['`App-Backend` is not an id: an id is written in lowercase, like `app-backend`.']);
  expect(refused(model, 'app-api backend')[0]).toMatch(/^`backend` does not begin with the word of a folder, so it does not say its kind\. Begin it with `person-`, .* as `app-backend`\.$/);
  expect(refused(model, 'app-api store-orders')).toEqual(['`store-orders` is taken: `stores/store-orders.yaml` has it. Give `app-api` another id, or rename that one too in a list.']);
  expect(refused(model, 'app-api app-api')).toEqual(['`app-api` is its id already, so there is nothing to rename.']);
  expect(refused(model, 'app-api app-backend', 'app-api app-front')).toEqual(['`apps/app-api` is renamed twice in the list: to `app-backend` and to `app-front`. Keep one.']);
  expect(refused(model, 'app-api app-backend', 'store-orders app-backend')).toEqual(['`app-backend` is the new id of both `app-api` and `store-orders`. Give each its own.']);
  const broken = [...model, file('components/component-checkout', 'name: [Checkout\nin: app-api\n')];
  expect(refused(broken, 'app-api app-backend')).toEqual([
    '`components/component-checkout.yaml` names `app-api`, and YAML cannot read it as a mapping, so it cannot be rewritten. Mend it as `seefore check` says, and rename again.',
  ]);
  // A broken file that does not name the record is no reason to refuse.
  expect(renameRecords(broken, pairs('store-orders store-orderbook'))).not.toHaveProperty('refusals');
  expect(JSON.stringify(model)).toBe(before);
});

test('where two records have the id, a field that may name only one is rewritten, and the rest is left and told', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/data-order', 'name: Order app\nin: system-shop\n'),
    file('data/data-order', 'name: Order\n'),
    file('features/feature-ordering', 'name: Ordering\n'),
    file('flows/flow-placing', lines('name: Placing', 'starts: An order', 'ends: It is kept', 'feature: feature-ordering', 'steps:', '  - {id: places, does: data-order, name: Takes it, data: [data-order]}')),
  ];
  const done = renamed(model, 'data/data-order data-purchase');
  expect(textAt(done.files, 'flows/flow-placing.yaml')).toContain('  - {id: places, does: data-order, name: Takes it, data: [data-purchase]}');
  expect(done.account.unsure).toEqual([]);
  const rule = file('rules/rule-order', lines('name: The order is kept apart', 'never: {id: data-order}'));
  expect(renamed([...model, rule], 'data/data-order data-purchase').account.unsure).toEqual([{ file: 'rules/rule-order.yaml', line: 2, id: 'data-order' }]);
});

test('a list is done as one, so `a b` with `b c` is no clash', () => {
  const model = [
    MARKER,
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-a', 'name: A\nin: system-shop\n'),
    file('apps/app-b', 'name: B\nin: system-shop\n'),
    file('components/component-in-a', 'name: In A\nin: app-a\n'),
    file('components/component-in-b', 'name: In B\nin: app-b\n'),
  ];
  const list = readRenames('app-a app-b\n\n  app-b   app-c  \n');
  expect(list).toEqual([
    { old: 'app-a', new: 'app-b', line: 1 },
    { old: 'app-b', new: 'app-c', line: 3 },
  ]);
  const done = renameRecords(model, list as Rename[]) as Renamed;
  expect(textAt(done.files, 'apps/app-b.yaml')).toBe('name: A\nin: system-shop\n');
  expect(textAt(done.files, 'apps/app-c.yaml')).toBe('name: B\nin: system-shop\n');
  expect(textAt(done.files, 'apps/app-a.yaml')).toBeUndefined();
  expect(textAt(done.files, 'components/component-in-a.yaml')).toBe('name: In A\nin: app-b\n');
  expect(textAt(done.files, 'components/component-in-b.yaml')).toBe('name: In B\nin: app-c\n');
  expect(problems(done.files)).toEqual([]);
  // A line of the list says where a refusal comes from.
  expect(readRenames('app-a\napp-b app-c\n')).toEqual({ refusals: ['Line 1 of the list holds one word. A line holds the old id and the new, as `monitoring app-monitoring`.'] });
  expect(renameRecords(model, readRenames('app-a app-c\napp-z app-y\n') as Rename[])).toEqual({
    refusals: ['Line 2 of the list: `app-z` names no record: no file of the model has that id, and no change adds it. The nearest id is `app-a`.'],
  });
});

test('a list migrates ids that have no word yet, connections and all', () => {
  const model = [
    MARKER,
    file('systems/shop', 'name: Shop\n'),
    file('apps/api', 'name: API\nin: shop\n'),
    file('stores/orders', 'name: Orders\nin: shop\n'),
    file('connections/api-writes-orders', 'from: api\nto: orders\naccess: write\nname: Saves\n'),
  ];
  const list = readRenames(['shop system-shop', 'api app-api', 'orders store-orders', 'api-writes-orders connection-api-writes-orders'].join('\n')) as Rename[];
  const done = renameRecords(model, list) as Renamed;
  // The part after the word does not change, so no connection follows: each is on the list.
  expect(done.account.renamed.map((each) => each.new)).toEqual(['system-shop', 'app-api', 'store-orders', 'connection-api-writes-orders']);
  expect(textAt(done.files, 'connections/connection-api-writes-orders.yaml')).toBe('from: app-api\nto: store-orders\naccess: write\nname: Saves\n');
  expect(problems(done.files)).toEqual([]);
});
