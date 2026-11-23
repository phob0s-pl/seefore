import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER = { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' };
const ALICE = { path: 'people/alice.yaml', text: 'name: Alice\n' };

/** The first problem of a small model of a marker, one good record and the given files. */
function problemsOf(...files: SourceFile[]) {
  return readModel([MARKER, ALICE, ...files]).problems;
}

test('a small good model is read, with its name and its records', () => {
  const read = readModel([
    MARKER,
    ALICE,
    { path: 'systems/shop.yaml', text: 'name: Shop\n' },
    { path: 'technologies/go.yaml', text: 'name: Go\n' },
    { path: 'apps/order-api.yaml', text: 'name: Order API\nin: shop\nkind: service\ntechnology: [go]\n' },
    { path: 'connections/a-to-b.yaml', text: 'from: alice\nto: order-api\n' },
  ]);
  expect(read.problems).toEqual([]);
  expect(read.name).toBe('Shop');
  expect(read.records.map((record) => `${record.kind}/${record.id}`)).toEqual(['apps/order-api', 'connections/a-to-b', 'people/alice', 'systems/shop', 'technologies/go']);
  expect(read.records[0]?.fields).toEqual({ name: 'Order API', in: 'shop', kind: 'service', technology: ['go'] });
});

test('a key that is not known is a problem, with the keys that are', () => {
  const [problem] = problemsOf({ path: 'apps/api.yaml', text: 'name: API\nin: shop\ncolour: red\n' });
  expect(problem).toMatchObject({ file: 'apps/api.yaml', line: 3, rule: 'key-unknown', severity: 'error', record: 'api' });
  expect(problem?.message).toContain('`colour` is not a key of an app');
  expect(problem?.fix).toContain('`in`');
});

test('a key that is missing is a problem', () => {
  const [problem] = problemsOf({ path: 'apps/api.yaml', text: 'name: API\n' });
  expect(problem).toMatchObject({ rule: 'key-missing', file: 'apps/api.yaml', field: 'in', severity: 'error' });
  expect(problem?.message).toContain('`in` is missing');
  expect(problem?.fix).toContain('The id of the system the app is part of');
});

test('a value of the wrong kind is a problem', () => {
  const [problem] = problemsOf({ path: 'apps/api.yaml', text: 'name: API\nin: shop\nkind: wizard\n' });
  expect(problem).toMatchObject({ rule: 'value-not-allowed', line: 3 });
  expect(problem?.message).toContain('`service`');
});

test('an id that is not allowed is a problem, and the record is left out', () => {
  const read = readModel([MARKER, { path: 'people/Bad_Id.yaml', text: 'name: Bad\n' }]);
  expect(read.problems.map((problem) => problem.rule)).toEqual(['id-invalid']);
  expect(read.records).toEqual([]);
});

test('a comment is a problem', () => {
  const [problem] = problemsOf({ path: 'people/bob.yaml', text: 'name: Bob\n# a note\n' });
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

test('a broken file leaves the others read', () => {
  const read = readModel([MARKER, ALICE, { path: 'people/bob.yaml', text: 'name: [\n' }]);
  expect(read.records.map((record) => record.id)).toEqual(['alice']);
  expect(read.problems).toHaveLength(1);
});
