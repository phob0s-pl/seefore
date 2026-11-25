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
  expect(steps[0]?.message).toContain('`colour` is not a key of the first step. Its keys are `id`, `does`');
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
