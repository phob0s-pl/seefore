import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = {
  path: 'seefore.yaml',
  text: 'format: 1\nname: Shop\n',
};
const SHOP: SourceFile = { path: 'systems/shop.yaml', text: 'name: Shop\n' };
const line = (id: string, text: string): SourceFile => ({
  path: `context/${id}.yaml`,
  text,
});
/** A model of one system and the lines given. */
const read = (...files: SourceFile[]) => readModel([MARKER, SHOP, ...files]);
const said = (...files: SourceFile[]) => read(...files).problems.map((problem) => [problem.rule, problem.file, problem.line, problem.message]);

test('a line of context is a record of its own, global or about one system, and a folded text is one line', () => {
  const model = read(
    line('orders-are-never-lost', 'must: An order is never lost once the customer has been told it is placed.\nwhy: It is what the shop promises its customers.\n'),
    line('features-go-into-the-api', 'prefer: >-\n  A new feature goes\n  into the Order API.\nwhy: One team runs it.\nsystem: shop\n'),
  );
  expect(model.problems).toEqual([]);
  expect(model.records.filter((record) => record.kind === 'context').map((record) => [record.id, record.fields])).toEqual([
    [
      'features-go-into-the-api',
      {
        prefer: 'A new feature goes into the Order API.',
        why: 'One team runs it.',
        system: 'shop',
      },
    ],
    [
      'orders-are-never-lost',
      {
        must: 'An order is never lost once the customer has been told it is placed.',
        why: 'It is what the shop promises its customers.',
      },
    ],
  ]);
  // The key that a system's record had is gone.
  const old = readModel([
    MARKER,
    {
      path: 'systems/shop.yaml',
      text: 'name: Shop\ncontext:\n  - must: A.\n    why: B.\n',
    },
  ]);
  expect(old.problems.map((problem) => [problem.rule, problem.message])).toEqual([['key-unknown', '`context` is not a key of a system. Its keys are `name`, `only`, `description`, `external` and `owner`.']]);
});

test('a line has one of must and prefer, and a why: each fault of form is one problem', () => {
  expect(said(line('both', 'must: A sentence.\nprefer: Another.\nwhy: A reason.\n'))).toEqual([
    ['context-line', 'context/both.yaml', 2, 'This line has both `must` and `prefer`. A line binds or it decides between designs: keep one of the two, or write two files.'],
  ]);
  expect(said(line('neither', 'why: A reason.\n'))).toEqual([
    ['context-line', 'context/neither.yaml', 1, 'This line has neither `must` nor `prefer`. Write the sentence under `must` if it binds, under `prefer` if it may yield.'],
  ]);
  expect(said(line('no-why', 'must: A sentence.\n'))).toEqual([['key-missing', 'context/no-why.yaml', 1, '`why` is missing from a line of context.']]);
  expect(said(line('named', 'must: A sentence.\nwhy: A reason.\nname: A name.\n'))).toEqual([
    ['key-unknown', 'context/named.yaml', 3, '`name` is not a key of a line of context. Its keys are `must`, `prefer`, `why` and `system`.'],
  ]);
  expect(said(line('two-lines', 'must: |\n  One line\n  and a second\nwhy: A reason.\n'))[0]?.[3]).toBe('`must` must be on one line. A text that is folded with `>-` is one line.');
  expect(said(line('long', `must: ${'a'.repeat(301)}\nwhy: A reason.\n`)).map((each) => each[0])).toEqual(['value-too-big']);
});

test('system names a system of the model, ours or an outside one, and nothing else', () => {
  const bank: SourceFile = {
    path: 'systems/bank.yaml',
    text: 'name: Bank\nexternal: true\n',
  };
  const api: SourceFile = {
    path: 'apps/api.yaml',
    text: 'name: API\nin: shop\n',
  };
  expect(said(bank, line('bank-is-fixed', 'must: The bank sets the format.\nwhy: Its contract.\nsystem: bank\n'))).toEqual([]);
  expect(said(line('typo', 'must: A sentence.\nwhy: A reason.\nsystem: shopp\n'))).toEqual([['reference-unknown', 'context/typo.yaml', 3, '`system` names `shopp`, but no record has that id. The nearest id is `shop`.']]);
  expect(said(api, line('of-an-app', 'must: A sentence.\nwhy: A reason.\nsystem: api\n'))).toEqual([
    ['reference-wrong-kind', 'context/of-an-app.yaml', 3, '`system` names `api`, which is an app. `system` names a system.'],
  ]);
  // An id names one record in the whole model: a line cannot take a system's.
  expect(said(line('shop', 'must: A sentence.\nwhy: A reason.\n')).map((each) => each[0])).toEqual(['id-twice']);
});

test('the thirteenth line of a group is a warning, told once for the group, and a faulty line leaves the rules judged', () => {
  const lines = (count: number, system?: string) =>
    Array.from({ length: count }, (_, at) => line(`${system ?? 'global'}-${String(at + 1).padStart(2, '0')}`, `must: Sentence ${at + 1}.\nwhy: A reason.\n${system !== undefined ? `system: ${system}\n` : ''}`));
  expect(read(...lines(12), ...lines(12, 'shop')).problems).toEqual([]);
  const over = read(...lines(14), ...lines(13, 'shop')).problems;
  expect(over.map((problem) => [problem.rule, problem.severity, problem.file, problem.message])).toEqual([
    ['context-many', 'warning', 'context/global-13.yaml', '14 lines of context are global. Keep to 12: a dozen sentences are read, a handbook is not.'],
    ['context-many', 'warning', 'context/shop-13.yaml', '13 lines of context are about `shop`. Keep to 12: a dozen sentences are read, a handbook is not.'],
  ]);
  // A rule of the team's own is judged though a line of context has a fault, and it chooses no line.
  const rule: SourceFile = {
    path: 'rules/every-record-is-a-system.yaml',
    text: 'name: Nothing is anything but a system\nnever: {not: {kind: systems}}\n',
  };
  const judged = read(rule, line('kept', 'must: A sentence.\nwhy: A reason.\n'), line('no-why', 'must: A sentence.\n'));
  expect(judged.problems.map((problem) => problem.rule)).toEqual(['key-missing']);
  expect(judged.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([['every-record-is-a-system', 'holds']]);
});
