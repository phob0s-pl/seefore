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
  expect(apps.split('\n').slice(0, 8)).toEqual([
    '# apps: one app a file',
    '',
    'Code that runs as a unit of its own: started, deployed or scaled apart from the rest. One code',
    'started under two commands or roles is two apps; copies of one are one app. A part built elsewhere',
    'and started or pinned here is an app too. In one system. C4 calls it a container.',
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
  expect(text('flows')).toContain(`\n\n${text('data')}`);
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
  expect(model.counts.flatMap((count) => count.found)).toEqual([]);
  expect(model.rulings.map((ruling) => [ruling.rule, ruling.state])).toEqual([['rule-people-through-gateway', 'holds']]);
  expect(model.laid.map((laid) => laid.change)).toEqual(['copies-for-accounts']);
});
