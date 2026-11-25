import { expect, test } from 'vitest';
import { changesOf } from '../src/model/changes.ts';
import { flowSteps } from '../src/model/flow.ts';
import { readModel } from '../src/model/read.ts';
import type { SourceFile } from '../src/model/read.ts';

const file = (path: string, text: string): SourceFile => ({ path: `${path}.yaml`, text });
/** A shop with one flow, and a change that adds a step to it, updates the API and removes a technology. */
const MODEL: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  file('systems/shop', 'name: Shop\n'),
  file('apps/api', 'name: API\nin: shop\ntechnology: [go]\n'),
  file('stores/orders', 'name: Orders\nin: shop\nkind: database\n'),
  file('people/customer', 'name: Customer\n'),
  file('technologies/go', 'name: Go\n'),
  file('connections/customer-orders', 'from: customer\nto: api\nname: Places an order\n'),
  file('connections/api-writes-orders', 'from: api\nto: orders\naccess: write\nname: Saves the order\n'),
  file('features/ordering', 'name: Ordering\n'),
  file('flows/placing', 'name: Placing an order\nstarts: A customer orders\nends: The order is kept\nfeature: ordering\nsteps:\n  - {id: places, does: customer-orders}\n  - {id: saves, does: api-writes-orders}\n'),
  file(
    'changes/post',
    [
      'name: Orders by post',
      'prompt: Take orders by post.',
      'update:',
      '  apps/api: {description: Takes the orders., technology: null}',
      '  flows/placing:',
      '    steps:',
      '      - places',
      '      - {id: checks, does: api, name: Checks the stock}',
      'remove:',
      '  - technologies/go',
      '',
    ].join('\n'),
  ),
];
const POINT = ['    name: An order is never saved', '    severity: block', '    about: [stores/orders]', '    finding: No step writes the store.'];
const review = (id: string, lines: string[]): SourceFile => file(`reviews/${id}`, [...lines, ''].join('\n'));
const read = (...files: SourceFile[]) => {
  const model = readModel([...MODEL, ...files]);
  return { model, changes: changesOf(model.records, model.laid) };
};

test('a review is read from the file that bears its change id, and leaves the check of the model as it was', () => {
  const { model, changes } = read(review('post', ['read: "4c1d9a70"', 'points:', '  never-saved:', ...POINT]));
  expect(model.problems).toEqual([]);
  expect(model.records.filter((record) => record.kind === 'reviews').map((record) => record.id)).toEqual(['post']);
  expect(changes.review('post')).toMatchObject({ read: '4c1d9a70', points: [{ id: 'never-saved', name: 'An order is never saved', severity: 'block', status: 'open', comments: [] }] });
  // A reading that found nothing is a full answer; a change with no file has no review.
  expect(read(review('post', ['read: "4c1d9a70"'])).changes.review('post')).toEqual({ read: '4c1d9a70', points: [] });
  expect(read().changes.review('post')).toBeUndefined();
  expect(changes.review('none')).toBeUndefined();
});

test('the faults of the form of a review are told, each at its place', () => {
  const { model, changes } = read(
    review('post', ['read: 12345678', 'points:', '  never-saved:', '    name: An order is never saved', '    severity: high', '    about: [nowhere, need, need]', '    finding: " "', '    status: done', '    who: A reviewer']),
  );
  expect(model.problems.map((problem) => [problem.file, problem.line, problem.message.split('.')[0]])).toEqual([
    ['reviews/post.yaml', 1, '`read` must be text, but this is a whole number'],
    ['reviews/post.yaml', 5, '`points'],
    ['reviews/post.yaml', 6, 'An address in `about` is a record as `folder/id`, a step of a flow as `flows/<id>#<step>`, or the word `need`'],
    ['reviews/post.yaml', 6, '`about` has the same address twice'],
    ['reviews/post.yaml', 7, '`points'],
    ['reviews/post.yaml', 8, '`points'],
    ['reviews/post.yaml', 9, '`who` is not a key of `points'],
  ]);
  // A file the check refuses is no review for the page.
  expect(changes.review('post')).toBeUndefined();
  // A point's id is held by the rule of every id, told where the point begins; so is an empty list of points.
  const more = read(review('post', ['read: "4c1d9a70"', 'points:', '  Never saved:', ...POINT])).model.problems;
  expect(more.map((problem) => [problem.line, problem.message])).toEqual([[4, "`Never saved` is not an id: an id is written in lowercase, like `never-saved`. A point's id is the key it stands under."]]);
  expect(read(review('post', ['read: "4c1d9a70"', 'points: {}'])).model.problems.map((problem) => problem.message)).toEqual(['`points` is empty. Leave it out when nothing is found.']);
});

test('a point says what it is about by name, and each address leads under the change where the change touches the record', () => {
  const { model, changes } = read(
    review('post', [
      'read: "4c1d9a70"',
      'points:',
      '  never-saved:',
      '    name: An order is never saved',
      '    severity: block',
      '    about: [flows/placing#checks, flows/placing#saves, stores/orders]',
      '    finding: No step writes the store.',
      '    recommendation: The flow says where an order is written.',
      '    status: reopened',
      '    comments: [It says so now., A description says it.]',
      '  no-technology:',
      '    name: The API names no technology',
      '    severity: note',
      '    about: [apps/api, technologies/go, need]',
      '    finding: The change takes it out.',
      '  nowhere:',
      '    name: Something that is not there',
      '    severity: note',
      '    about: [apps/ledger, flows/placing#no-such-step, connections/customer-orders]',
      '    finding: It names what no record has.',
    ]),
  );
  expect(model.problems).toEqual([]);
  const [first, second, third] = changes.review('post')?.points ?? [];
  expect(first).toMatchObject({ status: 'reopened', recommendation: 'The flow says where an order is written.', comments: ['It says so now.', 'A description says it.'] });
  expect(first?.about.map((each) => [each.address, each.label, each.step ?? null, each.to ?? null, each.record?.kind ?? null])).toEqual([
    // A step the change adds, and one it takes out, each with its words, on the flow under the change.
    ['flows/placing#checks', 'Placing an order', 'Checks the stock', '/changes/post/records/flows/placing#checks', 'flows'],
    ['flows/placing#saves', 'Placing an order', 'Saves the order', '/changes/post/records/flows/placing#saves', 'flows'],
    // A record the change does not touch leads to its page in the system.
    ['stores/orders', 'Orders', null, '/models/orders', 'stores'],
  ]);
  expect(second?.about.map((each) => [each.address, each.label, each.to ?? null, each.need ?? false])).toEqual([
    ['apps/api', 'API', '/changes/post/records/apps/api', false],
    // A record the change removes is read as it is today, and leads under the change.
    ['technologies/go', 'Go', '/changes/post/records/technologies/go', false],
    // The need is no record, and the answer says so.
    ['need', 'Need', '/changes/post', true],
  ]);
  // What names nothing stands as written and leads nowhere; a step that is not there leads to its flow.
  expect(third?.about.map((each) => [each.address, each.label, each.step ?? null, each.to ?? null])).toEqual([
    ['apps/ledger', 'apps/ledger', null, null],
    ['flows/placing#no-such-step', 'Placing an order', 'no-such-step', '/changes/post/records/flows/placing'],
    ['connections/customer-orders', 'Places an order', null, '/connections/customer-orders'],
  ]);
});

test('a change and its review that bear the id of a record shadow nothing of the model', () => {
  // The change and the review are named `orders`, as the store is, and `placing`, as the flow is.
  const body = 'name: Orders\nprompt: Keep the orders longer.\nupdate:\n  stores/orders: {description: Kept for ten years.}\n';
  const { model, changes } = read(file('changes/orders', body), review('orders', ['read: "4c1d9a70"', 'points:', '  never-saved:', ...POINT]), file('changes/placing', body.replace('Orders', 'Placing')), review('placing', ['read: "4c1d9a70"']));
  expect(model.problems).toEqual([]);
  expect(flowSteps(model.records, 'placing')?.steps.map((step) => [step.id, step.acts])).toEqual([
    ['places', 'Customer to API'],
    ['saves', 'API to Orders'],
  ]);
  expect(changes.review('orders')?.points[0]?.about).toMatchObject([{ label: 'Orders', to: '/changes/orders/records/stores/orders' }]);
  expect(changes.review('placing')).toEqual({ read: '4c1d9a70', points: [] });
});
