import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { listLines } from '../src/model/list.ts';
import type { ListAsked } from '../src/model/list.ts';
import { changeMark } from '../src/model/mark.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
/** The mark of a change among the files: what a review that read it as it is bears in `read`. */
const markOf = (id: string, files: readonly SourceFile[]): string => changeMark(parse((files.find((each) => each.path === `changes/${id}.yaml`) as SourceFile).text));
/** The review of a change that read it as it is. */
const review = (id: string, points: string[], files: readonly SourceFile[]): SourceFile => file(`reviews/${id}`, [`read: "${markOf(id, files)}"`, 'points:', ...points, ''].join('\n'));
/** A point in a status, with a recommendation when it is a block and the comments its status has had. */
const point = (id: string, severity: 'block' | 'note', status?: string): string[] => [
  `  ${id}:`,
  `    name: Point ${id}`,
  `    severity: ${severity}`,
  '    about: [need]',
  '    finding: Something is wrong.',
  ...(severity === 'block' ? ['    recommendation: Something is right.'] : []),
  ...(status !== undefined ? [`    status: ${status}`, '    comments:', '      - Said why.', ...(status === 'reopened' ? ['      - Said what is still open.'] : [])] : []),
];
/**
 * A shop with a flow, a rule and a line of context; a change that adds a ledger, updates the API
 * and removes the clerk; a change the check cannot lay; and three changes that are an input alone,
 * each with a review that waits for somebody else.
 */
const CHANGED: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('people/person-customer', 'name: Customer\n'),
  file('people/person-clerk', 'name: Clerk\n'),
  file('systems/system-shop', 'name: Shop\n'),
  file('apps/app-api', 'name: API\nin: system-shop\nkind: service\ntechnology: [tech-go]\n'),
  file('stores/store-orders', 'name: Orders\nin: system-shop\nkind: database\n'),
  file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nname: Places an order\n'),
  file('connections/connection-api-writes-orders', 'from: app-api\nto: store-orders\naccess: write\n'),
  file('technologies/tech-go', 'name: Go\n'),
  file('features/feature-ordering', 'name: Ordering\n'),
  file(
    'flows/flow-placing',
    'name: Placing an order\nstarts: A customer orders\nends: The order is kept\nfeature: feature-ordering\nsteps:\n  - {id: places, does: connection-customer-orders}\n  - {id: checks, does: app-api, name: Checks the stock}\n',
  ),
  file('rules/rule-api-in-go', 'name: The API is written in Go\neach: {id: app-api}\nmust: {technology: tech-go}\n'),
  file('context/context-one-host', 'must: All of it runs on one host.\nwhy: The budget is fixed for a year.\nsystem: system-shop\n'),
  file(
    'changes/ledger',
    ['name: A ledger', 'prompt: Keep a ledger of the orders.', 'add:', '  stores/store-ledger: {name: Ledger, in: system-shop, kind: database}', 'update:', '  apps/app-api: {description: Takes the orders and keeps a ledger.}', 'remove: [people/person-clerk]', ''].join('\n'),
  ),
  file('changes/broken', 'name: A broken change\nprompt: Change what is not there.\nupdate:\n  apps/app-nothing: {name: Nothing}\n'),
  file('changes/fixing', 'name: Fixing\nprompt: Fix it.\n'),
  file('changes/waiting', 'name: Waiting\nprompt: Wait.\n'),
  file('changes/done', 'name: Done\nprompt: Done.\n'),
];
const MODEL: SourceFile[] = [
  ...CHANGED,
  review('ledger', [...point('one', 'block'), ...point('two', 'block'), ...point('three', 'note'), ...point('four', 'block', 'fixed')], CHANGED),
  review('fixing', [...point('one', 'block', 'fixed'), ...point('two', 'block', 'declined')], CHANGED),
  review('waiting', [...point('one', 'block', 'declined'), ...point('two', 'block', 'reopened'), ...point('three', 'note')], CHANGED),
  review('done', [...point('one', 'block', 'closed'), ...point('two', 'note')], CHANGED),
];
const model = readModel(MODEL);
const lines = (asked: ListAsked): string[] => {
  const listed = listLines(model, asked);
  if ('error' in listed) throw new Error(listed.error);
  return listed.lines;
};
const error = (asked: ListAsked): string | undefined => {
  const listed = listLines(model, asked);
  return 'error' in listed ? listed.error : undefined;
};

test('the model is as the tests take it: only the broken change is faulted, and every other is laid', () => {
  expect(model.problems.map((problem) => problem.file)).toEqual(['changes/broken.yaml']);
  expect(model.laid.map((laid) => laid.change)).toEqual(['done', 'fixing', 'ledger', 'waiting']);
});

test('a line a record, in the order of the folders and then of the ids: its path, its name, what it is in or its two ends or its feature, and its kind', () => {
  expect(lines({})).toEqual([
    'people/person-clerk  Clerk',
    'people/person-customer  Customer',
    'systems/system-shop  Shop',
    'apps/app-api  API  in system-shop  service',
    'stores/store-orders  Orders  in system-shop  database',
    'connections/connection-api-writes-orders  No name  app-api -> store-orders',
    'connections/connection-customer-orders  Places an order  person-customer -> app-api',
    'technologies/tech-go  Go',
    'features/feature-ordering  Ordering',
    'flows/flow-placing  Placing an order  feature-ordering  2 steps',
    'rules/rule-api-in-go  The API is written in Go',
    'context/context-one-host  All of it runs on one host.',
  ]);
});

test('some folders alone; a folder that is not there is an error that names the folders', () => {
  expect(lines({ folders: ['connections', 'apps'] })).toEqual([
    'apps/app-api  API  in system-shop  service',
    'connections/connection-api-writes-orders  No name  app-api -> store-orders',
    'connections/connection-customer-orders  Places an order  person-customer -> app-api',
  ]);
  expect(error({ folders: ['apps', 'app'] })).toBe(
    '`app` is not a folder of the model. The nearest is `apps`. The folders are `people`, `systems`, `apps`, `stores`, `components`, `connections`, `infrastructure`, `owners`, `technologies`, `repositories`, `features`, `flows`, `data`, `rules` and `context`, and `changes` lists the changes.',
  );
  // A review is no record of the model; the folder `changes` alone is the list of the changes.
  expect(error({ folders: ['reviews'] })).toMatch(/^`reviews` holds no records of the model\./);
  expect(lines({ folders: ['changes'] })).toEqual(lines({ changes: true }));
});

test('near a record: its line, what it names, and what names it, a flow by its step and a rule by its selector among them', () => {
  expect(lines({ near: 'app-api' })).toEqual([
    'apps/app-api  API  in system-shop  service',
    'names:',
    '  systems/system-shop  Shop',
    '  technologies/tech-go  Go',
    'named by:',
    '  connections/connection-api-writes-orders  No name  app-api -> store-orders',
    '  connections/connection-customer-orders  Places an order  person-customer -> app-api',
    '  flows/flow-placing  Placing an order  feature-ordering  2 steps',
    '  rules/rule-api-in-go  The API is written in Go',
  ]);
  // A section with nothing in it is left out; a record may be asked for by its path too.
  expect(lines({ near: 'tech-go' })).toEqual(['technologies/tech-go  Go', 'named by:', '  apps/app-api  API  in system-shop  service', '  rules/rule-api-in-go  The API is written in Go']);
  expect(lines({ near: 'people/person-clerk' })).toEqual(['people/person-clerk  Clerk']);
  // The folders asked for keep what is near.
  expect(lines({ near: 'app-api', folders: ['flows'] })).toEqual(['apps/app-api  API  in system-shop  service', 'named by:', '  flows/flow-placing  Placing an order  feature-ordering  2 steps']);
  expect(error({ near: 'app-apu' })).toBe('No record has the id `app-apu`. The nearest id is `app-api`.');
  expect(error({ near: 'app-elsewhere' })).toBe('No record has the id `app-elsewhere`.');
});

test('the model as a change would make it: each record it adds, updates and removes marked, the one it removes still listed', () => {
  expect(lines({ change: 'ledger' })).toEqual([
    '- people/person-clerk  Clerk',
    '  people/person-customer  Customer',
    '  systems/system-shop  Shop',
    '~ apps/app-api  API  in system-shop  service',
    '+ stores/store-ledger  Ledger  in system-shop  database',
    '  stores/store-orders  Orders  in system-shop  database',
    '  connections/connection-api-writes-orders  No name  app-api -> store-orders',
    '  connections/connection-customer-orders  Places an order  person-customer -> app-api',
    '  technologies/tech-go  Go',
    '  features/feature-ordering  Ordering',
    '  flows/flow-placing  Placing an order  feature-ordering  2 steps',
    '  rules/rule-api-in-go  The API is written in Go',
    '  context/context-one-host  All of it runs on one host.',
  ]);
  expect(lines({ change: 'ledger', folders: ['stores', 'people'] })).toEqual(['- people/person-clerk  Clerk', '  people/person-customer  Customer', '+ stores/store-ledger  Ledger  in system-shop  database', '  stores/store-orders  Orders  in system-shop  database']);
  // A record the change adds is near only with the change.
  expect(lines({ change: 'ledger', near: 'store-ledger' })).toEqual(['+ stores/store-ledger  Ledger  in system-shop  database', 'names:', '    systems/system-shop  Shop']);
  expect(error({ near: 'store-ledger' })).toBe('No record has the id `store-ledger`.');
  expect(lines({ change: 'ledger', near: 'system-shop', folders: ['stores'] })).toEqual([
    '  systems/system-shop  Shop',
    'named by:',
    '  + stores/store-ledger  Ledger  in system-shop  database',
    '    stores/store-orders  Orders  in system-shop  database',
  ]);
  expect(error({ change: 'ledgr' })).toBe('There is no change `ledgr`. The nearest is `ledger`.');
  expect(error({ change: 'elsewhere' })).toBe('There is no change `elsewhere`. The changes are `broken`, `done`, `fixing`, `ledger` and `waiting`.');
  expect(error({ change: 'broken' })).toBe(
    'The check could not lay the change `broken` over the model, so the model as it would be is not known. Run `seefore check` and mend changes/broken.yaml.',
  );
});

test('a line a change, with who is next from its review: the corrector, the second reading, the person or nobody', () => {
  const mark = (id: string) => markOf(id, MODEL);
  expect(lines({ changes: true })).toEqual([
    `changes/broken  A broken change  no review  ${mark('broken')}`,
    `changes/done  Done  nothing open  ${mark('done')}`,
    `changes/fixing  Fixing  the second reading: 1 fixed  ${mark('fixing')}`,
    `changes/ledger  A ledger  the corrector: 2 open  ${mark('ledger')}`,
    `changes/waiting  Waiting  the person: 1 declined, 1 reopened  ${mark('waiting')}`,
  ]);
  expect(error({ changes: true, near: 'app-api' })).toBe('The changes are listed alone, with no record near and no change laid over the model.');
  expect(listLines(readModel(MODEL.filter((each) => !each.path.startsWith('changes/'))), { changes: true })).toEqual({ lines: [] });
});

test('a fixed note waits for the second reading, as a fixed block does; a note that is open, declined or reopened waits for nobody', () => {
  /** Who is next on the change `done`, with a review of these points. */
  const next = (points: string[]): string | undefined => {
    const read = readModel([...CHANGED, review('done', points, CHANGED)]);
    expect(read.problems.map((problem) => problem.file)).toEqual(['changes/broken.yaml']);
    const listed = listLines(read, { changes: true });
    return ('lines' in listed ? listed.lines.find((line) => line.startsWith('changes/done  ')) : undefined)?.split('  ')[2];
  };
  expect(next([...point('one', 'block', 'closed'), ...point('two', 'note', 'fixed')])).toBe('the second reading: 1 fixed');
  expect(next([...point('one', 'block', 'fixed'), ...point('two', 'note', 'fixed'), ...point('three', 'note')])).toBe('the second reading: 2 fixed');
  // While a block is open the corrector is next, whatever else is fixed.
  expect(next([...point('one', 'block'), ...point('two', 'note', 'fixed')])).toBe('the corrector: 1 open');
  expect(next([...point('one', 'note'), ...point('two', 'note', 'declined'), ...point('three', 'note', 'reopened'), ...point('four', 'block', 'closed')])).toBe('nothing open');
});

test('the line of an open change ends with its mark, and a review that writes the mark into `read` is not behind', () => {
  const listed = listLines(model, { changes: true });
  const printed = ('lines' in listed ? listed.lines.find((line) => line.startsWith('changes/ledger  ')) : undefined)?.split('  ').at(-1) ?? '';
  expect(printed).toMatch(/^[0-9a-f]{8}$/);
  const behind = (read: string) => readModel([...CHANGED, file('reviews/ledger', `read: "${read}"\n`)]).problems.filter((problem) => problem.rule === 'review-behind').length;
  expect([behind(printed), behind('00000000')]).toEqual([0, 1]);
});

/** The model with two decided changes: one applied, whose store is in the model now, and one rejected, with a review that still has a block open. */
const REFUSED = file('changes/refused', 'name: Refused\nprompt: Rename the API.\nstatus: rejected\nwhy: The API keeps its name.\nupdate:\n  apps/app-api: {name: Order API}\n');
const DECIDED: SourceFile[] = [
  ...MODEL,
  file('changes/kept', 'name: Kept\nprompt: Keep the orders.\nstatus: applied\nadd:\n  stores/store-orders: {name: Orders, in: system-shop, kind: database}\n'),
  REFUSED,
  review('refused', point('one', 'block'), [REFUSED]),
];

test('a decided change says applied or rejected in place of who is next', () => {
  const read = readModel(DECIDED);
  expect(read.problems.map((problem) => problem.file)).toEqual(['changes/broken.yaml']);
  expect(listLines(read, { changes: true })).toEqual({
    lines: [
      `changes/broken  A broken change  no review  ${markOf('broken', MODEL)}`,
      `changes/done  Done  nothing open  ${markOf('done', MODEL)}`,
      `changes/fixing  Fixing  the second reading: 1 fixed  ${markOf('fixing', MODEL)}`,
      'changes/kept  Kept  applied',
      `changes/ledger  A ledger  the corrector: 2 open  ${markOf('ledger', MODEL)}`,
      'changes/refused  Refused  rejected',
      `changes/waiting  Waiting  the person: 1 declined, 1 reopened  ${markOf('waiting', MODEL)}`,
    ],
  });
});

test('a decided change is not laid over the model, and asking for the model as it would make it says why', () => {
  const read = readModel(DECIDED);
  expect(read.laid.map((laid) => laid.change)).toEqual(['done', 'fixing', 'ledger', 'waiting']);
  expect(listLines(read, { change: 'kept' })).toEqual({ error: 'The change `kept` is applied: the model has its records already.' });
  expect(listLines(read, { change: 'refused' })).toEqual({ error: 'The change `refused` is rejected: it is not laid over the model.' });
});

test('a connection says what it passes through, after its two ends', () => {
  const read = readModel([
    { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
    file('people/person-customer', 'name: Customer\n'),
    file('systems/system-shop', 'name: Shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\n'),
    file('infrastructure/infra-gateway', 'name: Gateway\nin: system-shop\n'),
    file('connections/connection-customer-orders', 'from: person-customer\nto: app-api\nvia: [infra-gateway]\nname: Places an order\n'),
  ]);
  const listed = listLines(read, { folders: ['connections'] });
  expect('lines' in listed && listed.lines).toEqual(['connections/connection-customer-orders  Places an order  person-customer -> app-api via infra-gateway']);
});

test("a repository's line ends with `workspace` where it bears it; near a repository, the systems and apps whose code it holds, by their own key or their system's; near an app, its repository", () => {
  const read = readModel([
    { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
    file('systems/system-shop', 'name: Shop\nrepository: repo-shop\n'),
    file('apps/app-api', 'name: API\nin: system-shop\nkind: service\n'),
    file('apps/app-web', 'name: Web\nin: system-shop\nkind: browser\nrepository: repo-web\n'),
    file('repositories/repo-shop', 'name: shop\nurl: https://example.org/tea/shop\nworkspace: true\n'),
    file('repositories/repo-web', 'name: web\nurl: git@example.org:tea/web.git\n'),
    file('repositories/repo-deploy', 'name: deploy\ndescription: The compose file of the shop.\n'),
  ]);
  expect(read.problems).toEqual([]);
  const listed = (asked: ListAsked): string[] => {
    const said = listLines(read, asked);
    return 'lines' in said ? said.lines : [said.error];
  };
  expect(listed({ folders: ['repositories'] })).toEqual(['repositories/repo-deploy  deploy', 'repositories/repo-shop  shop  workspace', 'repositories/repo-web  web']);
  expect(listed({ near: 'repo-shop' })).toEqual([
    'repositories/repo-shop  shop  workspace',
    'named by:',
    '  systems/system-shop  Shop',
    'through their system:',
    '  apps/app-api  API  in system-shop  service',
  ]);
  // An app with its own names it; one with none has its system's.
  expect(listed({ near: 'app-web' })).toEqual(['apps/app-web  Web  in system-shop  browser', 'names:', '  systems/system-shop  Shop', '  repositories/repo-web  web']);
  expect(listed({ near: 'app-api' })).toEqual(['apps/app-api  API  in system-shop  service', 'names:', '  systems/system-shop  Shop', "its system's repository:", '  repositories/repo-shop  shop  workspace']);
  expect(listed({ near: 'system-shop', folders: ['repositories'] })).toEqual(['systems/system-shop  Shop', 'names:', '  repositories/repo-shop  shop  workspace']);
  // One that no part names is no fault, and nothing is near it.
  expect(listed({ near: 'repo-deploy' })).toEqual(['repositories/repo-deploy  deploy']);
});
