import { createHash } from 'node:crypto';
import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { changeMark, sha256 } from '../src/model/mark.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, ...lines: string[]): SourceFile => ({ path: `${path}.yaml`, text: `${lines.join('\n')}\n` });
/** A change that adds a post room and gives the flow a step `checks` in place of `keeps`. */
const CHANGE = [
  'name: Orders by post',
  'prompt: Take orders by post.',
  'given:',
  '  - A posted order is placed as one made online is.',
  'add:',
  '  apps/app-post-room:',
  '    name: Post room',
  '    in: system-shop',
  'update:',
  '  flows/flow-placing:',
  '    steps:',
  '      - places',
  '      - id: checks',
  '        does: app-api',
  '        name: Checks the stock',
  '',
].join('\n');
/** A shop with one flow, and the change `post`. */
const MODEL: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/system-shop', 'name: Shop'),
  file('apps/app-api', 'name: API', 'in: system-shop'),
  file('stores/store-orders', 'name: Orders', 'in: system-shop', 'kind: database'),
  file('people/person-customer', 'name: Customer'),
  file('connections/connection-customer-orders', 'from: person-customer', 'to: app-api', 'name: Places an order'),
  file('connections/connection-api-writes-orders', 'from: app-api', 'to: store-orders', 'access: write', 'name: Saves the order'),
  file('features/feature-ordering', 'name: Ordering'),
  file('flows/flow-placing', 'name: Placing an order', 'starts: A customer orders', 'ends: The order is kept', 'feature: feature-ordering', 'steps:', '  - {id: places, does: connection-customer-orders}', '  - {id: keeps, does: connection-api-writes-orders}'),
  { path: 'changes/post.yaml', text: CHANGE },
];
const mark = (text: string): string => changeMark(parse(text));
const MARK = mark(CHANGE);
/** A point of the review, under its id: a note about the need, with the lines given after. */
const point = (id: string, ...more: string[]): string[] => [`  ${id}:`, `    name: Point ${id}`, '    severity: note', '    about: [need]', '    finding: Something is wrong.', ...more];
/** The problems of the model with these files, each as its rule, where it is, what it says and its mend. */
const told = (...files: SourceFile[]) => readModel([...MODEL, ...files]).problems.map((problem) => [problem.rule, problem.severity, problem.line, problem.column, problem.message, problem.fix]);

test('SHA-256 gives the published digests of the empty text and of `abc`, and the digests of Node for longer texts and others than ASCII', () => {
  expect(sha256('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  for (const text of ['a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'a'.repeat(1000), 'Zażółć gęślą jaźń, 😀']) expect(sha256(text), text.slice(0, 10)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
});

test('the mark of a change is the same for another layout and another order of keys, and moves with a value, a record and a line of `given`', () => {
  expect(MARK).toMatch(/^[0-9a-f]{8}$/);
  const other = [
    'add: {apps/app-post-room: {in: system-shop, name: Post room}}',
    'given: [A posted order is placed as one made online is.]',
    'prompt: >-',
    '  Take orders',
    '  by post.',
    'update:',
    '  flows/flow-placing:',
    '    steps: [places, {name: Checks the stock, id: checks, does: app-api}]',
    'name: "Orders by post"',
  ].join('\n');
  expect(mark(other)).toBe(MARK);
  expect(mark(CHANGE.replace('Checks the stock', 'Checks what is in stock'))).not.toBe(MARK);
  expect(mark(CHANGE.replace('add:\n', 'add:\n  stores/store-post:\n    name: Post\n    in: system-shop\n'))).not.toBe(MARK);
  expect(mark(CHANGE.replace('given:\n', 'given:\n  - The clerk types it in.\n'))).not.toBe(MARK);
  // The order of the steps is a value too.
  expect(mark(CHANGE.replace('      - places\n', '').replace('        name: Checks the stock\n', '        name: Checks the stock\n      - places\n'))).not.toBe(MARK);
});

test('deciding a change does not move its mark: `status` and `why` are left out', () => {
  expect(mark(`${CHANGE}status: applied\n`)).toBe(MARK);
  expect(mark(`${CHANGE}status: rejected\nwhy: Nobody sends an order by post.\n`)).toBe(MARK);
  // As the check reads the file, so the mark is.
  const read = readModel([...MODEL.slice(0, -1), { path: 'changes/post.yaml', text: `${CHANGE}status: rejected\nwhy: Nobody sends an order by post.\n` }]);
  expect(changeMark(read.records.find((record) => record.kind === 'changes')?.fields ?? {})).toBe(MARK);
});

test('a review that read the change as it is, in another layout, has no problem', () => {
  expect(told(file('reviews/post', `read: "${MARK}"`, 'points:', ...point('one')))).toEqual([]);
  expect(readModel([...MODEL.slice(0, -1), { path: 'changes/post.yaml', text: CHANGE.replace('  apps/app-post-room:\n    name: Post room\n    in: system-shop\n', '  apps/app-post-room: {in: system-shop, name: Post room}\n') }, file('reviews/post', `read: "${MARK}"`)]).problems).toEqual([]);
});

test('a review with no change is an error at the start of its file; a change whose file does not read is there', () => {
  expect(told(file('reviews/posted', `read: "${MARK}"`))).toEqual([['review-no-change', 'error', 1, 1, 'This file reviews the change `posted`, and there is no `changes/posted.yaml`.', 'Name the file as its change is named, or take it out.']]);
  // A file of `reviews/` that does not read is still there.
  expect(told(file('reviews/posted', 'read: [')).map((problem) => problem[0])).toEqual(['review-no-change', 'yaml-syntax']);
  const broken = told(file('changes/posted', 'name: Posted', 'prompt: Make it: so.'), file('reviews/posted', `read: "${MARK}"`));
  expect(broken.map((problem) => problem[0])).toEqual(['yaml-syntax']);
});

test('an address that names nothing, neither today nor with the change, is an error at the address, with the nearest id; the need never is', () => {
  const review = file(
    'reviews/post',
    `read: "${MARK}"`,
    'points:',
    '  known:',
    '    name: Each address names a record or a step, today or with the change',
    '    severity: note',
    '    about: [apps/app-post-room, flows/flow-placing#checks, flows/flow-placing#keeps]',
    '    finding: Nothing is wrong.',
    '  unknown:',
    '    name: No address names a record or a step',
    '    severity: note',
    '    about: [apps/app-post-rooms, apps/store-orders, need]',
    '    finding: Something is wrong.',
    '  steps:',
    '    name: No address names a step',
    '    severity: note',
    '    about: [flows/flow-placing#check, flows/flow-placin#places, flows/flow-placing#weighs]',
    '    finding: Something is wrong.',
  );
  expect(told(review)).toEqual([
    [
      'reference-unknown',
      'error',
      11,
      13,
      '`about` of the point `unknown` names `apps/app-post-rooms`, but no record has that id, neither today nor with the change. The nearest id is `app-post-room`.',
      'If `app-post-room` was meant, write `apps/app-post-room` instead. Otherwise name a record that is there, or one the change adds, or take the address out.',
    ],
    ['reference-unknown', 'error', 11, 34, '`about` of the point `unknown` names `apps/store-orders`, but no record has that path, neither today nor with the change: `store-orders` is in `stores`.', 'Write `stores/store-orders`.'],
    [
      'reference-unknown',
      'error',
      16,
      13,
      '`about` of the point `steps` names the step `check` of `flows/flow-placing`, but the flow has no step with that id, neither today nor with the change. The nearest is `checks`.',
      'If `checks` was meant, write `flows/flow-placing#checks` instead. Otherwise name a step that the flow has, or one the change gives it, or take the address out.',
    ],
    [
      'reference-unknown',
      'error',
      16,
      39,
      '`about` of the point `steps` names `flows/flow-placin#places`, but no record has that id, neither today nor with the change. The nearest id is `flow-placing`.',
      'If `flow-placing` was meant, write `flows/flow-placing#places` instead. Otherwise name a record that is there, or one the change adds, or take the address out.',
    ],
    [
      'reference-unknown',
      'error',
      16,
      65,
      '`about` of the point `steps` names the step `weighs` of `flows/flow-placing`, but the flow has no step with that id, neither today nor with the change.',
      'Name a step that the flow has, or one the change gives it, or take the address out.',
    ],
  ]);
  // Each is told of the review, at its points.
  expect(readModel([...MODEL, review]).problems.map((problem) => [problem.record, problem.field])).toEqual(Array(5).fill(['post', 'points']));
});

test('a block with no recommendation, a status with no comment, and a reopened or settled point with one, are errors at the point, each saying who adds what', () => {
  const review = file(
    'reviews/post',
    `read: "${MARK}"`,
    'points:',
    '  a-block:',
    '    name: A block with no recommendation',
    '    severity: block',
    '    about: [need]',
    '    finding: Something is wrong.',
    ...point('fixed', '    status: fixed'),
    ...point('declined', '    status: declined'),
    ...point('closed', '    status: closed'),
    ...point('reopened', '    status: reopened', '    comments: [Changed the flow.]'),
    ...point('settled', '    status: settled', '    comments: [Declined as the clerk keeps it.]'),
    ...point('reopened-bare', '    status: reopened'),
    // A point in each status with the comments it needs is no fault.
    ...point('sound', '    status: reopened', '    comments: [Changed the flow., It still keeps nothing.]'),
  );
  expect(told(review)).toEqual([
    ['review-status', 'error', 5, 5, 'The point `a-block` is a block and has no recommendation.', 'The reviewer adds `recommendation`: what must be true of the change for the point to close, or a question for the person.'],
    ['review-status', 'error', 13, 5, 'The point `fixed` is `fixed` and has no comment.', 'The corrector adds one line that says what was changed.'],
    ['review-status', 'error', 19, 5, 'The point `declined` is `declined` and has no comment.', 'The corrector adds one line that says why nothing was changed.'],
    ['review-status', 'error', 25, 5, 'The point `closed` is `closed` and has no comment.', 'The reviewer adds one line that says how the correction settles the point.'],
    ['review-status', 'error', 31, 5, 'The point `reopened` is `reopened` and has one comment, of the two it needs.', "The reviewer adds one line, after the corrector's, that says what the correction leaves open, or what it breaks."],
    ['review-status', 'error', 38, 5, 'The point `settled` is `settled` and has one comment, of the two it needs.', "The skill `change` adds the person's word as one line, after the line that declined or reopened the point."],
    [
      'review-status',
      'error',
      45,
      5,
      'The point `reopened-bare` is `reopened` and has no comment.',
      'The corrector adds one line that says what was changed, or why nothing was; then the reviewer adds one that says what the correction leaves open, or what it breaks.',
    ],
  ]);
});

test('a review that read the change before it moved is behind, at `read`, and says the mark to write there', () => {
  expect(told(file('reviews/post', 'read: "3f9a0c21"', 'points:', ...point('one')))).toEqual([
    ['review-behind', 'warning', 1, 1, `\`read\` is \`3f9a0c21\`, and the change is \`${MARK}\` now: it moved after this reading.`, `Only a reading writes \`read\`: where points are \`fixed\`, the second reading reads them and writes \`${MARK}\` there; a correction leaves it as it is.`],
  ]);
});

test('more than twelve points, and a point with more than four comments, are warnings at the thirteenth point and at the fifth comment; a settled point has gone to the person', () => {
  const comments = (n: number) => ['    comments:', ...Array.from({ length: n }, (_, index) => `      - Comment ${index + 1}.`)];
  const points = Array.from({ length: 13 }, (_, index) => point(`point-${index + 1}`)).flat();
  expect(told(file('reviews/post', `read: "${MARK}"`, 'points:', ...points))).toEqual([
    ['review-many', 'warning', 63, 3, 'The review has 13 points. Keep to 12: a dozen are answered, a longer list is not.', 'Keep the points that must be answered, and join two that say one fault.'],
  ]);
  expect(told(file('reviews/post', `read: "${MARK}"`, 'points:', ...point('long', '    status: reopened', ...comments(6)), ...point('settled', '    status: settled', ...comments(6)), ...point('four', '    status: reopened', ...comments(4))))).toEqual([
    ['review-thread', 'warning', 14, 9, 'The point `long` has 6 comments. After four, a point goes to the person.', 'Ask the person to settle it, and write their word as its last comment with `status: settled`.'],
  ]);
});

test('the review of a decided change is held in its form alone: its addresses, its mark, its length and its threads are not held', () => {
  const rejected = { path: 'changes/post.yaml', text: `${CHANGE}status: rejected\nwhy: Nobody sends an order by post.\n` };
  const review = file(
    'reviews/post',
    'read: "3f9a0c21"',
    'points:',
    // A step that the change would have given the flow, and a record that a later change took out.
    ...point('gone', '    status: fixed', '    comments: [One., Two., Three., Four., Five.]').map((line) => line.replace('[need]', '[flows/flow-placing#checks, apps/app-gone]')),
    ...Array.from({ length: 12 }, (_, index) => point(`point-${index + 1}`)).flat(),
    ...point('bare', '    status: declined'),
  );
  expect(readModel([...MODEL.slice(0, -1), rejected, review]).problems.map((problem) => [problem.rule, problem.message])).toEqual([['review-status', 'The point `bare` is `declined` and has no comment.']]);
  // Open, the same review is held whole.
  expect(told(review).map((problem) => problem[0])).toEqual(['review-behind', 'reference-unknown', 'review-thread', 'review-many', 'review-status']);
});
