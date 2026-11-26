import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER = { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' };
const ALICE = { path: 'people/person-alice.yaml', text: 'name: Alice\n' };

/** The first problem of a small model of a marker, one good record and the given files. */
function problemsOf(...files: SourceFile[]) {
  return readModel([MARKER, ALICE, ...files]).problems;
}

test('a small good model is read, with its name and its records', () => {
  const read = readModel([
    MARKER,
    ALICE,
    { path: 'systems/system-shop.yaml', text: 'name: Shop\n' },
    { path: 'technologies/tech-go.yaml', text: 'name: Go\n' },
    { path: 'apps/app-order-api.yaml', text: 'name: Order API\nin: system-shop\nkind: service\ntechnology: [tech-go]\n' },
    { path: 'connections/connection-a-to-b.yaml', text: 'from: person-alice\nto: app-order-api\n' },
  ]);
  expect(read.problems).toEqual([]);
  expect(read.name).toBe('Shop');
  expect(read.records.map((record) => `${record.kind}/${record.id}`)).toEqual(['apps/app-order-api', 'connections/connection-a-to-b', 'people/person-alice', 'systems/system-shop', 'technologies/tech-go']);
  expect(read.records[0]?.fields).toEqual({ name: 'Order API', in: 'system-shop', kind: 'service', technology: ['tech-go'] });
});

test('a key that is not known is a problem, with the keys that are', () => {
  const [problem] = problemsOf({ path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\ncolour: red\n' });
  expect(problem).toMatchObject({ file: 'apps/app-api.yaml', line: 3, rule: 'key-unknown', severity: 'error', record: 'app-api' });
  expect(problem?.message).toContain('`colour` is not a key of an app');
  expect(problem?.fix).toContain('`in`');
});

test('a key that is missing is a problem', () => {
  const [problem] = problemsOf({ path: 'apps/app-api.yaml', text: 'name: API\n' });
  expect(problem).toMatchObject({ rule: 'key-missing', file: 'apps/app-api.yaml', field: 'in', severity: 'error' });
  expect(problem?.message).toContain('`in` is missing');
  expect(problem?.fix).toContain('The id of the system the app is part of');
});

test('a value of the wrong kind is a problem', () => {
  const [problem] = problemsOf({ path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\nkind: wizard\n' });
  expect(problem).toMatchObject({ rule: 'value-not-allowed', line: 3 });
  expect(problem?.message).toContain('`service`');
});

test('an id that is not allowed is a problem, and the record is left out', () => {
  const read = readModel([MARKER, { path: 'people/Bad_Id.yaml', text: 'name: Bad\n' }]);
  expect(read.problems.map((problem) => problem.rule)).toEqual(['id-invalid']);
  expect(read.records).toEqual([]);
});

test('a comment is a problem', () => {
  const [problem] = problemsOf({ path: 'people/person-bob.yaml', text: 'name: Bob\n# a note\n' });
  expect(problem).toMatchObject({ rule: 'yaml-comment', line: 2 });
});

test('a marker with no format is a problem, and no record is read', () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'name: Shop\n' }, ALICE]);
  expect(read.problems[0]).toMatchObject({ file: 'seefore.yaml', rule: 'key-missing' });
  expect(read.records).toEqual([]);
});

test('a format that is not 1 is a problem, and no record is read', () => {
  const read = readModel([{ path: 'seefore.yaml', text: 'format: 2\nname: Shop\n' }, ALICE]);
  expect(read.problems.map((problem) => problem.rule)).toEqual(['format-not-readable']);
  expect(read.records).toEqual([]);
});

test('a file in a folder that is not known is a warning, and says which are known', () => {
  const [problem] = problemsOf({ path: 'drafts/idea.yaml', text: 'name: Idea\n' });
  expect(problem).toMatchObject({ file: 'drafts/idea.yaml', rule: 'not-read', severity: 'warning' });
  expect(problem?.message).toContain('`people`');
});

/** A flow of the selling feature, with the steps given as lines of YAML. */
const flow = (steps: string, head = 'feature: feature-selling\n') => ({ path: 'flows/flow-a-sale.yaml', text: `name: Selling\nstarts: A clerk sells\nends: It is sold\n${head}steps:\n${steps}` });

test('a small good model with a feature, a flow and a data record reads with no problem, and counts nothing', () => {
  const read = readModel([
    MARKER,
    ALICE,
    { path: 'systems/system-shop.yaml', text: 'name: Shop\n' },
    { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\n' },
    { path: 'connections/connection-asks.yaml', text: 'from: person-alice\nto: app-api\nname: Asks for the account\n' },
    { path: 'features/feature-selling.yaml', text: 'name: Selling\ntouches: [app-api]\n' },
    { path: 'data/data-account-details.yaml', text: 'name: Account details\nfields:\n  - {name: id, description: The account number}\n  - {name: balance}\n' },
    flow('  - {id: asks, does: connection-asks}\n  - {id: gets, reply: asks, name: The account, data: [data-account-details]}\n  - {id: shows, does: app-api, name: Shows the balance, after: [gets]}\n'),
  ]);
  expect(read.problems).toEqual([]);
  expect(read.records.map((record) => record.kind)).toEqual(['apps', 'connections', 'data', 'features', 'flows', 'people', 'systems']);
  expect(read.records.find((record) => record.kind === 'flows')?.fields.steps).toHaveLength(3);
  expect(read.counts.map((count) => [count.rule, count.found.length])).toEqual([
    ['record-unused', 0],
    ['part-alone', 0],
    ['feature-alone', 0],
    ['step-unplaced', 0],
  ]);
});

test('a flow with no feature is a problem of its file', () => {
  const [problem] = problemsOf(flow('  - {id: a, name: A}\n', ''));
  expect(problem).toMatchObject({ rule: 'key-missing', file: 'flows/flow-a-sale.yaml', field: 'feature', line: 1 });
  expect(problem?.message).toBe('`feature` is missing from a flow.');
});

test('a fault inside a step or a field has its own place and names it in words', () => {
  const steps = problemsOf(flow(`  - id: one\n    colour: red\n  - {id: two, does: Bad Id}\n  - {id: three, name: "${'x'.repeat(120)}"}\n`));
  expect(steps.map(({ rule, line, column }) => [rule, line, column])).toEqual([
    ['key-unknown', 7, 5],
    ['value-invalid', 8, 21],
    ['value-too-big', 9, 23],
  ]);
  expect(steps[0]?.message).toBe('`colour` is not a key of the first step. Its keys are `id`, `does`, `reply`, `after`, `name`, `only`, `description` and `data`.');
  expect(steps[1]?.message).toMatch(/^`does` of the second step holds the id of a connection, a part or a flow\./);
  expect(steps[2]?.message).toBe('`name` of the third step has 120 characters. It may have at most 100.');

  const fields = problemsOf(
    { path: 'data/data-order.yaml', text: 'name: Order\nfields:\n  - name: items\n  - description: Where it goes\n' },
    { path: 'data/data-parcel.yaml', text: 'name: Parcel\nfields:\n  - name: items\n  - name: weight\n  - name: items\n' },
  );
  expect(fields.map(({ file, rule, line, message }) => [file, rule, line, message])).toEqual([
    ['data/data-order.yaml', 'key-missing', 4, '`name` is missing from the second field.'],
    ['data/data-parcel.yaml', 'field-twice', 5, "The third field has the name `items`, as the first field has. A field's name stands once in its record."],
  ]);
});

/** A shop with an app and a store, for what joins them. */
const PARTS: SourceFile[] = [
  { path: 'systems/system-shop.yaml', text: 'name: Shop\n' },
  { path: 'apps/app-api.yaml', text: 'name: API\nin: system-shop\n' },
  { path: 'stores/store-orders.yaml', text: 'name: Orders\nin: system-shop\nkind: database\n' },
];

test('`source` is no key: a part, a connection and a step that bear it are each refused as a key that is not theirs', () => {
  const said = (...files: SourceFile[]) => problemsOf(...PARTS, ...files).map((problem) => [problem.rule, problem.file, problem.line, problem.field, problem.message]);
  expect(said({ path: 'apps/app-web.yaml', text: 'name: Web\nin: system-shop\nsource: [web/]\n' })).toEqual([
    ['key-unknown', 'apps/app-web.yaml', 3, 'source', '`source` is not a key of an app. Its keys are `name`, `in`, `only`, `description`, `kind`, `technology`, `owner` and `repository`.'],
  ]);
  expect(said({ path: 'connections/connection-api-reads-orders.yaml', text: 'from: app-api\nto: store-orders\naccess: read\nsource: [api/orders.go]\n' })).toEqual([
    [
      'key-unknown',
      'connections/connection-api-reads-orders.yaml',
      4,
      'source',
      '`source` is not a key of a connection. Its keys are `from`, `to`, `via`, `opens`, `access`, `name`, `only`, `description` and `technology`.',
    ],
  ]);
  expect(said({ path: 'features/feature-selling.yaml', text: 'name: Selling\n' }, flow('  - {id: sells, does: app-api, name: Sells the tea, source: [api/sell.go]}\n'))).toEqual([
    ['key-unknown', 'flows/flow-a-sale.yaml', 6, 'steps', '`source` is not a key of the first step. Its keys are `id`, `does`, `reply`, `after`, `name`, `only`, `description` and `data`.'],
  ]);
  // So it is for every other part, and for a record that a change adds.
  expect(
    said(
      { path: 'stores/store-carts.yaml', text: 'name: Carts\nin: system-shop\nsource: [db/]\n' },
      { path: 'components/component-cart.yaml', text: 'name: Cart\nin: app-api\nsource: [api/cart/]\n' },
      { path: 'infrastructure/infra-proxy.yaml', text: 'name: Proxy\nsource: [deploy/proxy.conf]\n' },
      { path: 'changes/a-worker.yaml', text: 'name: A worker\nprompt: Add a worker.\nadd:\n  apps/app-worker: {name: Worker, in: system-shop, source: [worker/main.go]}\n' },
    ).map(([rule, file, line, field]) => [rule, file, line, field]),
  ).toEqual([
    ['key-unknown', 'changes/a-worker.yaml', 4, 'add'],
    ['key-unknown', 'components/component-cart.yaml', 3, 'source'],
    ['key-unknown', 'infrastructure/infra-proxy.yaml', 2, 'source'],
    ['key-unknown', 'stores/store-carts.yaml', 3, 'source'],
  ]);
});

test('the check names what a list holds, and says that a key of one value may only be that', () => {
  // Found in the first round of the skill `model`: "Take ids out of" a list of paths, and "`opens` must be one of `to`".
  const fixes = (...files: SourceFile[]) => problemsOf(...PARTS, ...files).map((problem) => [problem.rule, problem.message, problem.fix]);
  const given = Array.from({ length: 16 }, (_, index) => `Answer ${index + 1}.`).join(', ');
  expect(fixes({ path: 'changes/a-change.yaml', text: `name: A change\nprompt: Make it so.\ngiven: [${given}]\n` })).toEqual([
    ['value-too-big', '`given` is too long a list: it may have at most 15.', 'Take lines out of `given` until it has at most 15.'],
  ]);
  expect(fixes({ path: 'changes/a-change.yaml', text: 'name: A change\nprompt: Make it so.\ngiven: []\n' }).map((each) => each[2])).toEqual(['Give `given` at least one line, or delete the key.']);
  expect(fixes({ path: 'connections/connection-api-calls-api.yaml', text: 'from: app-api\nto: app-api\nopens: from\n' }).map((each) => [each[1], each[2]])).toEqual([
    ['`opens` may only be `to`. Otherwise take the key out.', 'Write `to`, or delete the key.'],
  ]);
  expect(fixes({ path: 'systems/system-bank.yaml', text: 'name: Bank\nexternal: yes\n' }).map((each) => each[1])).toEqual(['`external` may only be `true`. Otherwise take the key out.']);
  // A part may talk to its own copies, and two connections may join the same two parts, one for each purpose.
  expect(
    fixes(
      { path: 'connections/connection-api-syncs-api.yaml', text: 'from: app-api\nto: app-api\nname: Syncs with its copies\n' },
      { path: 'connections/connection-api-reads-orders.yaml', text: 'from: app-api\nto: store-orders\naccess: read\nname: Reads orders\n' },
      { path: 'connections/connection-api-writes-orders.yaml', text: 'from: app-api\nto: store-orders\naccess: write\nname: Saves orders\n' },
    ),
  ).toEqual([]);
});

test('the lines of `assumed` are held as those of `given` are, and each fault of them names `assumed`', () => {
  const said = (key: string, lines: string[]) =>
    problemsOf(...PARTS, { path: 'changes/a-change.yaml', text: `name: A change\nprompt: Make it so.\n${key}:${lines.length === 0 ? ' []' : lines.map((line) => `\n  - ${line}`).join('')}\n` }).map((problem) => [problem.rule, problem.line, problem.field, problem.message, problem.fix]);
  const faulty = ['""', '" A space first."', '"One line\\nand a second"', 'x'.repeat(301), 'The copies are files.', 'The copies are files.'];
  const change = 'Change the value as the message says, or delete the key if it is optional.';
  expect(said('assumed', faulty)).toEqual([
    ['value-invalid', 4, 'assumed', 'A line of `assumed` is empty.', change],
    ['value-too-small', 4, 'assumed', 'The first line is empty.', 'Give the key a longer value, as the message says, or delete the key if it is optional.'],
    ['value-invalid', 5, 'assumed', 'A line of `assumed` starts or ends with a space. Take the space off.', change],
    ['value-invalid', 6, 'assumed', 'A line of `assumed` must be on one line.', change],
    ['value-too-big', 7, 'assumed', 'The fourth line has 301 characters. It may have at most 300.', 'Shorten the value to the limit the message gives.'],
    ['value-invalid', 9, 'assumed', '`assumed` has the same line twice. Keep one.', change],
  ]);
  // Fifteen lines at most, as `given` has: answering a review adds to both.
  const many = Array.from({ length: 16 }, (_, index) => `Choice ${index + 1}.`);
  expect(said('assumed', many.slice(0, 15))).toEqual([]);
  expect(said('assumed', many).map((each) => [each[3], each[4]])).toEqual([['`assumed` is too long a list: it may have at most 15.', 'Take lines out of `assumed` until it has at most 15.']]);
  expect(said('given', many).map((each) => each[3])).toEqual(['`given` is too long a list: it may have at most 15.']);
  expect(said('assumed', []).map((each) => [each[3], each[4]])).toEqual([['`assumed` is an empty list.', 'Give `assumed` at least one line, or delete the key.']]);
  // The two keys share one shape: `given` is told the very same, under its own name.
  const under = (key: string) => (each: unknown[]) => each.map((part) => (typeof part === 'string' ? part.replaceAll('`assumed`', `\`${key}\``).replace(/^assumed$/, key) : part));
  for (const lines of [faulty, []]) expect(said('given', lines)).toEqual(said('assumed', lines).map(under('given')));
  // A change may have both, and either alone.
  expect(said('assumed', ['The copies are files. A database would serve better if the accountants want to search them.'])).toEqual([]);
  expect(problemsOf(...PARTS, { path: 'changes/a-change.yaml', text: 'name: A change\nprompt: Make it so.\ngiven:\n  - A day late is fine.\nassumed:\n  - The copies are files.\n' })).toEqual([]);
});

test('a repository in form reads; each fault of its form is told with its mend, and a `url` is held by the forms it is cloned from', () => {
  const repository = (text: string) => ({ path: 'repositories/repo-shop-deploy.yaml', text });
  const read = readModel([MARKER, repository('name: shop-deploy\ndescription: The compose file.\nurl: git@example.org:tea/shop-deploy.git\nworkspace: true\n')]);
  expect(read.problems).toEqual([]);
  expect(read.records[0]?.fields).toEqual({ name: 'shop-deploy', description: 'The compose file.', url: 'git@example.org:tea/shop-deploy.git', workspace: true });
  const said = (text: string) => problemsOf(repository(text)).map((problem) => [problem.rule, problem.line, problem.field, problem.message, problem.fix]);
  // A name is that of a folder, which holds no slash, backslash, colon or control character.
  const clone = 'Write in `name` the name of the folder a plain clone of the repository makes: the last part of its `url`, without `.git`, as `shop-deploy`.';
  const holds = (what: string) => `\`name\` holds ${what}. A repository's \`name\` is the name of the folder a plain clone of it makes, and a folder's name cannot hold it.`;
  expect(said('name: tea/shop-deploy\n')).toEqual([['repository-name', 1, 'name', holds('`/`'), clone]]);
  expect(said('name: tea\\shop-deploy\n')).toEqual([['repository-name', 1, 'name', holds('`\\`'), clone]]);
  expect(said('name: "tea: shop"\n')).toEqual([['repository-name', 1, 'name', holds('`:`'), clone]]);
  expect(said('name: "shop\\tdeploy"\n')).toEqual([['repository-name', 1, 'name', holds('the control character U+0009'), clone]]);
  for (const name of ['.', '..']) expect(said(`name: "${name}"\n`)).toEqual([['repository-name', 1, 'name', `\`name\` is \`${name}\`, which names a folder by where it is, and not by its name.`, clone]]);
  // A fault of the line is told once, by the line.
  expect(said('name: "shop\\ndeploy"\n').map((each) => each[3])).toEqual(['`name` must be on one line.']);
  expect(said('name: shop-deploy\nworkspace: false\n')).toEqual([['value-not-allowed', 2, 'workspace', '`workspace` may only be `true`. Otherwise take the key out.', 'Write `true`, or delete the key.']]);
  expect(said('name: shop-deploy\npath: ../shop-deploy\n')).toEqual([
    [
      'key-unknown',
      2,
      'path',
      '`path` is not a key of a repository. Its keys are `name`, `description`, `url` and `workspace`.',
      'Delete the key `path` from the file, or, if a known key was meant, rename it. Its keys are `name`, `description`, `url` and `workspace`.',
    ],
  ]);
  // A `url` is an address of one of the forms a repository is cloned from; anything else is refused, a path on a disk by what it begins with.
  const mend =
    "Write in `url` where the repository is cloned from: an address begun with `https://`, `http://`, `ssh://` or `git://`, or one of the form `git@host:path`; where the host is one letter, write `ssh://host/path`. Or take `url` out. Where a checkout lies on a machine is never written: with `workspace: true` it lies beside the model's folder, in a folder of its `name`.";
  const url = (value: string) => said(`name: shop-deploy\nurl: '${value}'\n`);
  for (const good of ['https://example.org/a', 'http://example.org/a', 'ssh://git@example.org/a.git', 'git://example.org/a', 'git@example.org:tea/shop.git']) expect(url(good), good).toEqual([]);
  const disk = (start: string) => `\`url\` is a path on a disk: it begins with \`${start}\`. A \`url\` says where the repository is cloned from.`;
  const none = '`url` is no address a repository is cloned from: it neither begins with `https://`, `http://`, `ssh://` or `git://`, nor has the form `user@host:path`.';
  for (const [bad, message] of [
    ['src/shop', none],
    ['shop.git', none],
    ['src\\shop', none],
    ['HTTPS://example.org/a', none],
    ['https://', none],
    ['git@ex/ample.org:tea/shop.git', none],
    ['FILE:///x', disk('FILE:')],
    ['h:/srv/shop.git', disk('h:')],
    ['/tmp/x', disk('/')],
    ['\\\\server\\x', disk('\\')],
    ['~/x', disk('~')],
    ['./x', disk('.')],
    ['C:\\x', disk('C:')],
    ['https://example.org/tea/shop deploy', '`url` has a space or a line break in it. An address a repository is cloned from has neither.'],
    ['https://example.org/tea/shop\u0085', '`url` has a space or a line break in it. An address a repository is cloned from has neither.'],
  ] as const)
    expect(url(bad), bad).toEqual([['repository-url', 2, 'url', message, mend]]);
  // Its limit is told as every other limit is; an empty one once.
  expect(url(`https://example.org/${'a'.repeat(181)}`)).toEqual([['value-too-big', 2, 'url', '`url` has 201 characters. It may have at most 200.', 'Shorten the value to the limit the message gives.']]);
  expect(url(`https://example.org/${'a'.repeat(180)}`)).toEqual([]);
  expect(said("name: shop-deploy\nurl: ''\n").map((each) => each[3])).toEqual(['`url` is empty.']);
});

test('a sentence cut by a comma inside a short mapping is told as that, and a key that is simply not known is not', () => {
  const [cut] = problemsOf({ path: 'data/data-order.yaml', text: 'name: Order\nfields:\n  - {name: items, description: What is bought, and how many}\n' });
  expect(cut).toMatchObject({ rule: 'key-unknown', line: 3 });
  expect(cut?.message).toContain('`and how many` is not a key of the first field');
  expect(cut?.fix).toContain('A comma inside `{ }` starts a new key');
  const [plain] = problemsOf({ path: 'data/data-order.yaml', text: 'name: Order\nfields:\n  - {name: items, colour: red}\n' });
  expect(plain?.fix).toContain('Delete the key `colour`');
});

test('a broken file leaves the others read', () => {
  const read = readModel([MARKER, ALICE, { path: 'people/person-bob.yaml', text: 'name: [\n' }]);
  expect(read.records.map((record) => record.id)).toEqual(['person-alice']);
  expect(read.problems).toHaveLength(1);
});
