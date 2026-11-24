import { expect, test } from 'vitest';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const MARKER: SourceFile = { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' };
/** A model of one system, whose record ends with the lines given. */
const read = (context: string) => readModel([MARKER, { path: 'systems/shop.yaml', text: `name: Shop\n${context}` }]);
const said = (context: string) => read(context).problems.map((problem) => [problem.rule, problem.line, problem.message]);

const GOOD = [
  'context:',
  '  - must: An order is never lost once the customer has been told it is placed.',
  '    why: It is what the shop promises its customers.',
  '  - prefer: >-',
  '      A new feature goes',
  '      into the Order API.',
  '    why: One team runs it. It yields where another team must own the feature.',
  '',
].join('\n');

test('a system holds lines of context, each must or prefer with its why, and a folded text is one line', () => {
  const model = read(GOOD);
  expect(model.problems).toEqual([]);
  expect(model.records[0]?.fields.context).toEqual([
    { must: 'An order is never lost once the customer has been told it is placed.', why: 'It is what the shop promises its customers.' },
    { prefer: 'A new feature goes into the Order API.', why: 'One team runs it. It yields where another team must own the feature.' },
  ]);
  // A system with no context says nothing of it, and only a system has the key.
  expect(read('').problems).toEqual([]);
  const app = readModel([MARKER, { path: 'systems/shop.yaml', text: 'name: Shop\n' }, { path: 'apps/api.yaml', text: 'name: API\nin: shop\ncontext:\n  - must: A.\n    why: B.\n' }]);
  expect(app.problems.map((problem) => problem.rule)).toEqual(['key-unknown']);
});

test('a line has one of must and prefer, and a why: each fault is one problem at its line', () => {
  expect(said('context:\n  - must: A sentence.\n    prefer: Another.\n    why: A reason.\n')).toEqual([
    ['context-line', 4, 'The first line of `context` has both `must` and `prefer`. A line binds or it decides between designs: keep one of the two, or write two lines.'],
  ]);
  expect(said('context:\n  - why: A reason.\n')).toEqual([
    ['context-line', 3, 'The first line of `context` has neither `must` nor `prefer`. Write the sentence under `must` if it binds, under `prefer` if it may yield.'],
  ]);
  expect(said('context:\n  - must: A sentence.\n')).toEqual([['key-missing', 3, '`why` is missing from the first line of `context`.']]);
  expect(said('context:\n  - must: A sentence.\n    why: A reason.\n    source: The contract.\n')).toEqual([
    ['key-unknown', 5, '`source` is not a key of the first line of `context`. Its keys are `must`, `prefer` and `why`.'],
  ]);
});

test('no line twice, twelve lines at most, and a text on one line', () => {
  expect(said('context:\n  - must: A sentence.\n    why: A reason.\n  - prefer: A sentence.\n    why: Another reason.\n')).toEqual([
    ['context-line', 5, 'The second line of `context` says the same as the first line of `context`. Keep one.'],
  ]);
  const thirteen = `context:\n${Array.from({ length: 13 }, (_, at) => `  - must: Sentence ${at}.\n    why: Reason ${at}.\n`).join('')}`;
  expect(read(thirteen).problems.map((problem) => problem.rule)).toEqual(['value-too-big']);
  expect(said('context:\n  - must: |\n      One line\n      and a second\n    why: A reason.\n')[0]?.[2]).toBe('`must` of the first line of `context` must be on one line. A text that is folded with `>-` is one line.');
  // A value of the wrong kind is one problem, not two.
  expect(said('context: Keep it simple.\n')).toEqual([['value-wrong-kind', 2, '`context` must be a list, but this is text.']]);
  expect(said('context: []\n').map((each) => each[2])).toEqual(['`context` is an empty list.']);
});
