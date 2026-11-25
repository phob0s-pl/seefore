import { expect, test } from 'vitest';
import { z } from 'zod';
import { EXAMPLES, TOPICS, guideText } from '../src/model/guide.ts';
import { KINDS } from '../src/model/kinds.ts';
import { readModel } from '../src/model/read.ts';
import { SHAPES } from '../src/model/records.ts';

const FOLDERS = KINDS.map((kind) => kind.folder);
const text = (topic?: string): string => {
  const guide = guideText(topic);
  if ('error' in guide) throw new Error(guide.error);
  return guide.text;
};

/** Every key a shape has, at any depth, as its JSON Schema says: in a mapping, an item of a list, a value under ids, a form of a union, a shape it names. */
function keysOf(folder: keyof typeof SHAPES): Set<string> {
  const schema = z.toJSONSchema(SHAPES[folder], { target: 'draft-7', io: 'input' }) as Record<string, unknown>;
  const keys = new Set<string>();
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (typeof node !== 'object' || node === null || seen.has(node)) return;
    seen.add(node);
    const value = node as Record<string, unknown>;
    if (typeof value.$ref === 'string') walk((schema.definitions as Record<string, unknown>)[value.$ref.replace('#/definitions/', '')]);
    for (const [key, inner] of Object.entries((value.properties as Record<string, unknown> | undefined) ?? {})) {
      keys.add(key);
      walk(inner);
    }
    walk(value.items);
    walk(value.additionalProperties);
    for (const forms of [value.anyOf, value.oneOf, value.allOf]) if (Array.isArray(forms)) forms.forEach(walk);
  };
  walk(schema);
  return keys;
}

test('the topics are the sixteen folders, then the five skills', () => {
  expect(TOPICS).toEqual([...FOLDERS, 'model', 'flows', 'context', 'change', 'review']);
});

test('a folder: what a record is, the word of its ids, each key needed or not with what it holds, and an example', () => {
  const apps = text('apps');
  expect(apps.split('\n').slice(0, 9)).toEqual([
    '# apps: one app a file',
    '',
    'Code that runs as a unit of its own: started, deployed or scaled apart from the rest. One code that',
    'a deploy file or config starts under two commands or roles is two apps; copies of one are one app.',
    'The subcommands a person types at a program are that program. A part built elsewhere and started or',
    'pinned here is an app too. In one system. C4 calls it a container.',
    '',
    'Its id begins with `app-` and says what it is, as `app-order-api`: the name of its file,',
    "apps/app-order-api.yaml, in the model's folder, which is the one that holds `seefore.yaml`.",
  ]);
  expect(apps).toContain('\nKeys:\n  name (needed)\n    What people call it: one line of 1 to 100 characters, with no space at either end.\n  in (needed)\n');
  expect(apps).toContain('\n  source (may be left out)\n    Where its code lies: one to three paths of a file or a folder,');
  expect(apps).toContain(`\nExample, apps/app-order-api.yaml:\n${EXAMPLES.apps?.text.split('\n').map((line) => `  ${line}`).join('\n')}`);
  // A nested shape shows its keys under the key that holds it.
  expect(text('data')).toContain('\n  fields (may be left out)\n    What it holds: a list of at least one field, each with a `name` that stands once.\n    One thing a data record holds');
  expect(text('data')).toMatch(/\n {6}name \(needed\)\n {8}What the field is called/);
  // A change and a review have no word: a review is named as its change.
  expect(text('changes')).toContain('Its id is its own, with no word of a folder before it');
  expect(text('reviews')).toContain('It is named as its change: the review of changes/copies-for-accounts.yaml is\nreviews/copies-for-accounts.yaml.');
  // A rule tells the keys of a selector once, in a section of its own.
  const rules = text('rules');
  expect(rules.match(/^A selector:$/gm)).toHaveLength(1);
  expect(rules).toContain('Its keys are those of `way` in `never`, above.');
});

test("the guide of flows says that a flow tells one way, that its id says the task as a doing, how a step is named and where its code is", () => {
  // As read, with the lines joined.
  const words = (topic: string) => text(topic).replace(/\s+/g, ' ');
  const flows = words('flows');
  expect(flows).toContain(
    'and what is true at the end. It has one start and tells one way. Another way to the same outcome is a flow of its own; where the ways part for a few steps only, each of those steps has `only`, and the step at which they meet names the last step of each in `after`. ',
  );
  expect(flows).toContain('Its id begins with `flow-` and says the task as a doing, as `flow-placing-an-order`: the name of its file, flows/flow-placing-an-order.yaml.');
  expect(flows).toContain(
    'name (may be left out) What happens, verb first: one line of 1 to 100 characters. Left out only where the name of the connection or of the flow in `does` says this step and no more. A reply always has one: it says what comes back. A step that happens once for each of several things says "each", as in `Weighs each tea of the order`. Where copies of one app take turns, it says which copy acts. ',
  );
  // A step's `source` stands last among its keys.
  expect(flows).toContain(
    'reply. A list with no id twice. source (may be left out) Where the code does it: the paths of one to three files, counted from the folder that holds the model\'s folder, written with `/`. A path with `..`, with `*` or with `/` at its start is an error, and the check warns when a path is not there or is a folder. Left out when no file is known to show it. Example,',
  );
  expect(flows).toContain('name: Checks the order and works out the price source: [services/orders/checkout.go] - id: confirms');
  expect(words('connections')).toContain(
    'When `from` has no code here, a file of the far side: the route of `to` that takes its call, or, where `to` is a store, the code that reads what `from` writes there or writes what it reads; from a person, the entry point they use. Left out when no file is known to show it.',
  );
  // Every other folder's id says what it is.
  for (const folder of FOLDERS.filter((each) => each !== 'flows' && each !== 'changes' && each !== 'reviews')) expect(words(folder), folder).toContain(' and says what it is, as ');
});

test('every key of every shape is in the guide of its folder, and every line of a guide has at most 100 characters', () => {
  for (const folder of FOLDERS) {
    const guide = text(folder);
    for (const key of keysOf(folder)) expect(guide, `${folder}: ${key}`).toMatch(new RegExp(`^ +${key} \\((needed|may be left out)\\)$`, 'm'));
    for (const line of guide.split('\n')) expect(line.length, `${folder}: ${line}`).toBeLessThanOrEqual(100);
  }
});

test('a skill: the guides of the folders it writes, one after another', () => {
  const heads = (topic: string) => text(topic).split('\n').filter((line) => line.startsWith('# ')).map((line) => line.slice(2, line.indexOf(':')));
  expect(heads('model')).toEqual(['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners', 'technologies']);
  expect(heads('flows')).toEqual(['features', 'flows', 'data']);
  expect(heads('context')).toEqual(['context', 'rules']);
  expect(heads('change')).toEqual(['changes']);
  expect(heads('review')).toEqual(['reviews']);
  // A key that an earlier folder of the skill told in the same words is told by that folder's name, and where the folders lie is said once, at the head.
  const model = text('model');
  expect(model).toContain('\n  name (needed): as in people.\n');
  expect(model).toContain('\n  technology (may be left out): as in apps.\n');
  expect(model.match(/The condition under which the thing is there at all/g)).toHaveLength(1);
  expect(model.match(/the one that holds/g)).toHaveLength(1);
  expect(model).toContain(`\nExample, ${EXAMPLES.connections?.path}:\n`);
  // A folder's own guide tells every key in full.
  expect(text('stores')).not.toContain('as in');
  // Its head says which folders the skill writes, and where they lie.
  expect(text('change').split('\n').slice(0, 2)).toEqual(['The skill change writes the folder changes. The folders lie in the model\'s folder, the one that', 'holds `seefore.yaml`. Its guide follows.']);
});

test('no topic: the topics, a line each; a topic that is not there is an error that names them', () => {
  const index = text();
  expect(text('')).toBe(index);
  for (const folder of FOLDERS) expect(index).toMatch(new RegExp(`^  ${folder} +\\S`, 'm'));
  expect(index).toContain('\n  apps            Code that runs as a unit of its own: started, deployed or scaled apart from the rest.\n');
  expect(index).toContain('\n  flows           features, flows and data\n');
  expect(index).toContain('\n  review          reviews');
  expect(guideText('app')).toEqual({
    error:
      'There is no topic `app`. The topics are the folders `people`, `systems`, `apps`, `stores`, `components`, `connections`, `infrastructure`, `owners`, `technologies`, `features`, `flows`, `data`, `rules`, `context`, `changes` and `reviews`, and the skills `model`, `flows`, `context`, `change` and `review`.',
  });
});

test('every example is a file of its folder, and all sixteen read together as one model with no problem at all', () => {
  expect(Object.keys(EXAMPLES)).toEqual(FOLDERS);
  for (const [folder, example] of Object.entries(EXAMPLES)) expect(example.path).toMatch(new RegExp(`^${folder}/[a-z0-9-]+\\.yaml$`));
  const model = readModel([{ path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' }, ...Object.values(EXAMPLES).map((example) => ({ path: example.path, text: `${example.text}\n` }))]);
  expect(model.problems).toEqual([]);
  expect(model.records.map((record) => record.kind)).toEqual([...FOLDERS].sort());
  // One example a folder gives one connection, so the store and the component of the examples stand alone: nothing else is counted.
  expect(model.counts.flatMap((count) => count.found.map((item) => [count.rule, item.record]))).toEqual([
    ['part-alone', 'component-checkout'],
    ['part-alone', 'store-orders'],
  ]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([['rule-people-through-gateway', 'holds']]);
  expect(model.laid.map((laid) => laid.change)).toEqual(['copies-for-accounts']);
});
