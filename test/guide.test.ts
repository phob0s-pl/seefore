import { expect, test } from 'vitest';
import { parse } from 'yaml';
import { z } from 'zod';
import { EXAMPLES, TOPICS, guideText } from '../src/model/guide.ts';
import { KINDS } from '../src/model/kinds.ts';
import { changeMark } from '../src/model/mark.ts';
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

test('the topics are the seventeen folders, then the six skills', () => {
  expect(TOPICS).toEqual([...FOLDERS, 'model', 'flows', 'context', 'change', 'answer', 'review']);
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
  // An app's keys end at `repository`, which names a record and never says where its code lies on a disk.
  expect(apps).toContain('\n  owner (may be left out)\n    The id of the owner, a record in owners/, who answers for the part. Left out, it is that of what\n    the part is in.\n  repository (may be left out)\n');
  expect(apps).toContain('\n  repository (may be left out)\n    The id of the repository its code is in, a record in repositories/. Left out, it is that of its\n    system: leave it out where it is the same.\n\nExample, apps/app-order-api.yaml:\n');
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

test("the guide of flows says that a flow tells one way, that its id says the task as a doing, and how a step is named", () => {
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
  // A step's keys end at `removes`, and the step of the example names no file.
  expect(flows).toContain('A step that takes a job off a queue, so that no other worker gets it, names the job in `removes`, and in `data` too where the same step reads it. A read that leaves the thing there, as of a topic, names it in `data` alone. Example, flows/flow-placing-an-order.yaml:');
  expect(flows).toContain('name: Checks the order and works out the price - id: confirms');
  // Every other folder's id says what it is.
  for (const folder of FOLDERS.filter((each) => each !== 'flows' && each !== 'changes' && each !== 'reviews')) expect(words(folder), folder).toContain(' and says what it is, as ');
});

test("the guide of flows tells a step's `access` and `removes` after `data`, and what a step that reads a store names in `data`; its example flow stays", () => {
  const flows = text('flows').replace(/\s+/g, ' ');
  expect(flows).toContain(
    [
      'data (may be left out) The ids of the data this step passes, records in data/: on a step on a connection, or on a reply. A list with no id twice.',
      'On a step that writes a store it names what the step puts there; on one that reads a store, what the store holds: what the reader makes of it is named on the step that puts it somewhere.',
      'access (may be left out) Whether this step reads or writes the store its connection ends at: `read` or `write`.',
      "Only on a step whose connection says `access: read-write`; left out there, the store shows nothing of the step's `data`. A step that reads one thing and writes another is two steps.",
      'removes (may be left out) The ids of the data that is no longer in the store after this step, records in data/, none twice: on a step on a connection that ends at a store.',
      'A step that takes a job off a queue, so that no other worker gets it, names the job in `removes`, and in `data` too where the same step reads it. A read that leaves the thing there, as of a topic, names it in `data` alone.',
    ].join(' '),
  );
  expect(EXAMPLES.flows?.text).not.toMatch(/access|removes/);
});

test('every key of every shape is in the guide of its folder, no guide speaks of `source`, and every line of a guide has at most 100 characters', () => {
  for (const topic of TOPICS) expect(text(topic), topic).not.toMatch(/`source`|^\s*source:/m);
  for (const folder of FOLDERS) {
    const guide = text(folder);
    for (const key of keysOf(folder)) expect(guide, `${folder}: ${key}`).toMatch(new RegExp(`^ +${key} \\((needed|may be left out)\\)$`, 'm'));
    for (const line of guide.split('\n')) expect(line.length, `${folder}: ${line}`).toBeLessThanOrEqual(100);
  }
});

test('a skill: the guides of the folders it writes, one after another', () => {
  const heads = (topic: string) => text(topic).split('\n').filter((line) => line.startsWith('# ')).map((line) => line.slice(2, line.indexOf(':')));
  expect(heads('model')).toEqual(['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners', 'technologies', 'repositories']);
  expect(heads('flows')).toEqual(['features', 'flows', 'data']);
  expect(heads('context')).toEqual(['context', 'rules']);
  expect(heads('change')).toEqual(['changes']);
  expect(heads('answer')).toEqual(['changes', 'reviews']);
  expect(heads('review')).toEqual(['reviews']);
  // A key that an earlier folder of the skill told in the same words is told by that folder's name, and where the folders lie is said once, at the head.
  const model = text('model');
  expect(model).toContain('\n  name (needed): as in people.\n');
  expect(model).toContain('\n  technology (may be left out): as in apps.\n');
  expect(model.match(/The condition under which the thing is there at all/g)).toHaveLength(1);
  expect(model.replace(/\s+/g, ' ').match(/the one that holds/g)).toHaveLength(1);
  expect(model).toContain(`\nExample, ${EXAMPLES.connections?.path}:\n`);
  // A folder's own guide tells every key in full.
  expect(text('stores')).not.toContain('as in');
  // Its head says which folders the skill writes, and where they lie.
  expect(text('change').split('\n').slice(0, 2)).toEqual(['The skill change writes the folder changes. The folders lie in the model\'s folder, the one that', 'holds `seefore.yaml`. Its guide follows.']);
});

test('the guide of repositories says what a record is written from and never, what `workspace` means for a search, and the guide of the skill model holds it', () => {
  const words = (topic: string) => text(topic).replace(/\s+/g, ' ');
  const repositories = words('repositories');
  expect(repositories).toContain("# repositories: one repository a file A repository that holds code or deploy files of the system, other than the one the model's folder lies in: that one needs no record.");
  expect(repositories).toContain('It says which repository to read, and never where a checkout lies on a machine: no path, and no folder inside it.');
  expect(repositories).toContain('A system or an app whose code is in it names it with `repository`; one that holds only deploy files or documents is named by none.');
  expect(repositories).toContain("Written from a file that names the repository, as a clone script, a workspace's manifest or a package's own `repository`, or from a person's word; never from an image's name. Its id begins with");
  expect(repositories).toContain('Its id begins with `repo-` and says what it is, as `repo-shop-deploy`');
  expect(repositories).toContain('Read it there, and search it by naming that folder: a search begun above it skips a folder that an ignore file names.');
  expect(repositories).toContain(
    'url (may be left out) Where it is cloned from: one line of 1 to 200 characters with no space, begun with `https://`, `http://`, `ssh://` or `git://`, or of the form `git@host:path`. Never a path on a disk.',
  );
  expect(text('repositories')).toContain(`\nExample, repositories/repo-shop-deploy.yaml:\n${EXAMPLES.repositories?.text.split('\n').map((line) => `  ${line}`).join('\n')}`);
  // The skill model writes it after the technologies, and a system's key differs from an app's.
  expect(text('model')).toContain(`\n# repositories: one repository a file\n`);
  expect(text('model')).toContain(`\nKeys:\n${text('repositories').split('\nKeys:\n')[1]}`);
  expect(words('systems')).toContain(
    "repository (may be left out) The id of the repository its code is in, a record in repositories/: written on the system only when the code of all its apps is there, else on each app. Left out when it is the one the model's folder lies in, and when nobody has said.",
  );
  expect(EXAMPLES.repositories?.text).toBe(['name: shop-deploy', 'description: The compose file and the scripts that start every app of the shop.', 'url: https://example.org/tea/shop-deploy', 'workspace: true'].join('\n'));
});

test('the skill answer: the guides of changes and of reviews, each whole, since no key of a change is one of a review; the index names it', () => {
  const answer = text('answer');
  const head = ["The skill answer writes the folders changes and reviews. The folders lie in the model's folder, the", 'one that holds `seefore.yaml`. The guide of each follows.'];
  // A point's `name` and `status` lie under `points`: they are a review's own, and none is told as in changes.
  expect(answer).toBe([...head, '', text('changes'), '', text('reviews')].join('\n'));
  expect(answer).not.toContain('as in changes');
  expect(text()).toContain('\n  change          changes\n  answer          changes and reviews\n  review          reviews');
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
      'There is no topic `app`. The topics are the folders `people`, `systems`, `apps`, `stores`, `components`, `connections`, `infrastructure`, `owners`, `technologies`, `repositories`, `features`, `flows`, `data`, `rules`, `context`, `changes` and `reviews`, and the skills `model`, `flows`, `context`, `change`, `answer` and `review`.',
  });
});

test('the example review bears the mark of the example change in `read`, so that it read the change as it is', () => {
  expect(EXAMPLES.reviews?.text.split('\n')[0]).toBe(`read: "${changeMark(parse(EXAMPLES.changes?.text ?? ''))}"`);
});

test('every example is a file of its folder, and all seventeen read together as one model with no problem at all', () => {
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
