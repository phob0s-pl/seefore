import { KINDS, WORDS } from './kinds.ts';
import { SHAPES, SelectorSchema } from './records.ts';

/**
 * What `seefore guide` prints: the words of the format, for a folder or for a skill. What a
 * record is, each key and what it holds come from the shapes the check uses; only the examples
 * are written here, one small shop, and a test reads them all as one model.
 */

/** The most characters of a line, where the shapes' own words allow. */
const WIDTH = 100;

/** The folders each skill writes, in the order its guide gives them. */
const SKILLS: Readonly<Record<string, readonly string[]>> = {
  model: ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners', 'technologies'],
  flows: ['features', 'flows', 'data'],
  context: ['context', 'rules'],
  change: ['changes'],
  review: ['reviews'],
};

const FOLDERS: readonly string[] = KINDS.map((kind) => kind.folder);

/** The topics: the sixteen folders, then the five skills. A skill shares its name with a folder twice, `flows` and `context`: its guide holds that folder's. */
export const TOPICS: readonly string[] = [...FOLDERS, ...Object.keys(SKILLS)];

/** One example file of each folder: one small shop, whose files are true to one another. */
export const EXAMPLES: Readonly<Record<string, { path: string; text: string }>> = {
  people: { path: 'people/person-customer.yaml', text: ['name: Customer', 'description: Somebody who buys tea from the shop on its website.'].join('\n') },
  systems: { path: 'systems/system-shop.yaml', text: ['name: Shop', 'description: Sells tea online and sends the orders out.', 'owner: owner-shop-team'].join('\n') },
  apps: {
    path: 'apps/app-order-api.yaml',
    text: ['name: Order API', 'in: system-shop', 'kind: service', 'description: Takes the orders that customers place, and keeps them.', 'source: [services/orders/]'].join('\n'),
  },
  stores: {
    path: 'stores/store-orders.yaml',
    text: ['name: Orders', 'in: system-shop', 'kind: database', 'technology: [tech-postgres]', 'description: Every order, from the moment it is placed.', 'source: [db/migrations/]'].join('\n'),
  },
  components: {
    path: 'components/component-checkout.yaml',
    text: ['name: Checkout', 'in: app-order-api', 'description: Checks an order and works out what it costs.', 'source: [services/orders/checkout.go]'].join('\n'),
  },
  connections: {
    path: 'connections/connection-customer-places-order.yaml',
    text: ['from: person-customer', 'to: app-order-api', 'via: [infra-gateway]', 'name: Places an order', 'only: when the shop is open'].join('\n'),
  },
  infrastructure: { path: 'infrastructure/infra-gateway.yaml', text: ['name: Gateway', 'in: system-shop', 'description: Takes every request from outside and passes it on.'].join('\n') },
  owners: { path: 'owners/owner-shop-team.yaml', text: ['name: Shop team', 'description: The developers who build and run the shop.'].join('\n') },
  technologies: { path: 'technologies/tech-postgres.yaml', text: ['name: PostgreSQL', 'description: The database server the orders are kept in.'].join('\n') },
  features: { path: 'features/feature-ordering.yaml', text: ['name: Ordering', 'description: A customer buys tea, and knows that the shop has the order.', 'owner: owner-shop-team'].join('\n') },
  flows: {
    path: 'flows/flow-placing-an-order.yaml',
    text: [
      'name: Place an order',
      'starts: A customer presses Buy',
      'ends: The customer sees the number of the order',
      'feature: feature-ordering',
      'steps:',
      '  - id: places',
      '    does: connection-customer-places-order',
      '    data: [data-order]',
      '  - id: checks',
      '    does: component-checkout',
      '    name: Checks the order and works out the price',
      '  - id: confirms',
      '    reply: places',
      '    name: Shows the number of the order',
    ].join('\n'),
  },
  data: {
    path: 'data/data-order.yaml',
    text: ['name: Order', 'description: What a customer buys, and where it goes.', 'fields:', '  - name: items', '    description: Each tea, and how much of it', '  - name: address'].join('\n'),
  },
  rules: {
    path: 'rules/rule-people-through-gateway.yaml',
    text: [
      'name: A person reaches the shop only through the gateway',
      'description: The gateway counts and limits the requests that come from outside.',
      'each:',
      '  kind: connections',
      '  from: {kind: people}',
      'must:',
      '  via: {id: infra-gateway}',
    ].join('\n'),
  },
  context: {
    path: 'context/context-one-region.yaml',
    text: ['must: Every part of the shop runs in one region of one cloud.', 'why: The contract with the hosting company covers one region, until it is renewed in 2027.', 'system: system-shop'].join('\n'),
  },
  changes: {
    path: 'changes/copies-for-accounts.yaml',
    text: [
      'name: Copies of the orders for the accounts',
      'prompt: The accountants need every order in their own system, within a day.',
      'given:',
      '  - A copy a day late is fine, since the accounts are closed each month.',
      'add:',
      '  stores/store-order-copies:',
      '    name: Order copies',
      '    in: system-shop',
      '    kind: files',
      '    description: A copy of each order, written once a night for the accounts.',
      '  connections/connection-api-writes-copies:',
      '    from: app-order-api',
      '    to: store-order-copies',
      '    access: write',
      "    name: Writes the night's orders",
      'update:',
      '  apps/app-order-api:',
      '    description: Takes the orders that customers place, keeps them, and copies them each night.',
    ].join('\n'),
  },
  reviews: {
    path: 'reviews/copies-for-accounts.yaml',
    text: [
      'read: "3f9a0c21"',
      'points:',
      '  copies-unread:',
      '    name: Nothing takes the copies to the accounts',
      '    severity: block',
      '    about: [stores/store-order-copies, need]',
      '    finding: No connection reads store-order-copies, so the accountants get no order.',
      '    recommendation: The accountants have each copy within a day.',
      '    status: declined',
      '    comments:',
      '      - Declined, since the accountants fetch the file themselves.',
    ].join('\n'),
  },
};

// ---- the shapes, as the guide reads them

type Def = { type?: string; innerType?: unknown; element?: unknown; valueType?: unknown; options?: readonly unknown[] };
const defOf = (schema: unknown): Def | undefined => (schema as { _zod?: { def?: Def } } | undefined)?._zod?.def;

/** A schema without the `optional` around it. */
function bare(schema: unknown): unknown {
  let current = schema;
  while (defOf(current)?.type === 'optional') current = defOf(current)?.innerType;
  return current;
}

/** The keys of a mapping, and the schema of each; none for what is no mapping. */
function shapeOf(schema: unknown): Record<string, unknown> | undefined {
  if (typeof schema !== 'object' || schema === null || !('shape' in schema)) return undefined;
  const shape = (schema as { shape: unknown }).shape;
  return typeof shape === 'object' && shape !== null ? (shape as Record<string, unknown>) : undefined;
}

/** The words a schema carries: its own, or those of what its `optional` wraps. */
function described(schema: unknown): string | undefined {
  for (let current = schema; current !== undefined; current = defOf(current)?.type === 'optional' ? defOf(current)?.innerType : undefined) {
    const description = (current as { description?: unknown }).description;
    if (typeof description === 'string' && description !== '') return description;
  }
  return undefined;
}

/** The mapping a key holds: itself, each item of its list, each value under its ids, or the one form of it that is a mapping. */
function mappingIn(schema: unknown): unknown {
  let current = bare(schema);
  const type = defOf(current)?.type;
  if (type === 'array') current = bare(defOf(current)?.element);
  else if (type === 'record') current = bare(defOf(current)?.valueType);
  if (defOf(current)?.type === 'union') current = defOf(current)?.options?.map(bare).find((option) => shapeOf(option) !== undefined);
  return shapeOf(current) !== undefined ? current : undefined;
}

/** The keys of a selector: a mapping that has them all holds a selector, told once in its own section. */
const SELECTOR_KEYS: readonly string[] = Object.keys(shapeOf(SelectorSchema) ?? {});
const holdsSelector = (keys: readonly string[]): boolean => SELECTOR_KEYS.every((key) => keys.includes(key));

/** Words broken into lines of at most `WIDTH` characters, each with `indent` spaces before it. A word longer than a line stands alone. */
function wrap(words: string, indent: number): string[] {
  const pad = ' '.repeat(indent);
  const lines: string[] = [];
  let line = '';
  for (const word of words.split(/\s+/).filter((each) => each !== '')) {
    if (line !== '' && pad.length + line.length + 1 + word.length > WIDTH) {
      lines.push(pad + line);
      line = word;
    } else line = line === '' ? word : `${line} ${word}`;
  }
  if (line !== '') lines.push(pad + line);
  return lines;
}

/** What a guide has told so far: whether a selector is named, so that its section follows, and where each mapping was told, by the keys that hold it. */
type Told = { selector: boolean; mappings: Map<object, string> };

/**
 * The keys of a mapping, each with whether it is needed and what it holds, and the keys of a
 * mapping it holds under it. A selector is told once, in its own section; a mapping told already
 * is named by where it was. `above` is the keys that hold this mapping, the nearest last.
 */
function keyLines(shape: Record<string, unknown>, indent: number, told: Told, above: readonly string[] = []): string[] {
  const lines: string[] = [];
  for (const key of Object.keys(shape)) {
    const schema = shape[key];
    lines.push(`${' '.repeat(indent)}${key} (${defOf(schema)?.type === 'optional' ? 'may be left out' : 'needed'})`);
    const said = described(schema) ?? '';
    lines.push(...wrap(said, indent + 2));
    const inner = mappingIn(schema);
    const keys = shapeOf(inner);
    if (keys === undefined) continue;
    const where = [key, ...above].map((each) => `\`${each}\``).join(' in ');
    if (holdsSelector(Object.keys(keys))) {
      told.selector = true;
      const more = Object.keys(keys).filter((each) => !SELECTOR_KEYS.includes(each));
      lines.push(...wrap(more.length === 0 ? 'It holds a selector: its keys are under "A selector".' : `It holds a selector, with the keys under "A selector", and ${more.map((each) => `\`${each}\``).join(', ')}:`, indent + 2));
      lines.push(...keyLines(Object.fromEntries(more.map((each) => [each, keys[each]])), indent + 4, told, [key, ...above]));
      continue;
    }
    const before = told.mappings.get(keys);
    if (before !== undefined) {
      lines.push(...wrap(`Its keys are those of ${before}, above.`, indent + 2));
      continue;
    }
    told.mappings.set(keys, where);
    const own = described(inner);
    if (own !== undefined && own !== said) lines.push(...wrap(own, indent + 2));
    lines.push(...keyLines(keys, indent + 4, told, [key, ...above]));
  }
  return lines;
}

/** What the id of a record of a folder is. */
function idLine(folder: string): string {
  const example = EXAMPLES[folder]?.path ?? `${folder}/<id>.yaml`;
  const id = example.slice(folder.length + 1, -'.yaml'.length);
  if (folder === 'changes') return `Its id is its own, with no word of a folder before it: the name of its file, as \`${id}\` in ${example}.`;
  if (folder === 'reviews') return `It is named as its change: the review of changes/${id}.yaml is ${example}. Its id is that of the change.`;
  return `Its id begins with \`${WORDS[folder]}-\` and says what it is, as \`${id}\`: the name of its file, ${example}, in the model's folder, which is the one that holds \`seefore.yaml\`.`;
}

/** The guide of one folder: what a record is, its id, its keys and one example file. */
function folderGuide(folder: string): string {
  const kind = KINDS.find((each) => each.folder === folder);
  const shape = SHAPES[folder as keyof typeof SHAPES];
  const example = EXAMPLES[folder];
  const told: Told = { selector: false, mappings: new Map() };
  const keys = keyLines(shapeOf(shape) ?? {}, 2, told);
  const lines = [`# ${folder}: one ${kind?.one ?? folder} a file`, '', ...wrap(described(shape) ?? '', 0), '', ...wrap(idLine(folder), 0), '', 'Keys:', ...keys];
  if (told.selector) lines.push('', 'A selector:', ...wrap(described(SelectorSchema) ?? '', 2), ...keyLines(shapeOf(SelectorSchema) ?? {}, 2, told));
  if (example !== undefined) lines.push('', `Example, ${example.path}:`, ...example.text.split('\n').map((line) => `  ${line}`));
  return lines.join('\n');
}

/** Names joined as people join them: "a", "a and b", "a, b and c". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** The first sentence of a text: up to the first full stop that ends a word. */
const firstSentence = (words: string): string => /^.*?[.!?](?=\s|$)/s.exec(words)?.[0] ?? words;

/** The topics, a line each: the folders and then the skills. */
function index(): string {
  const width = Math.max(...TOPICS.map((topic) => topic.length)) + 2;
  const row = (topic: string, words: string) => `  ${topic.padEnd(width)}${words}`;
  return [
    'seefore guide <topic>: the words of the format, for a folder or for a skill.',
    '',
    'Folders, one record a file:',
    ...FOLDERS.map((folder) => row(folder, firstSentence(described(SHAPES[folder as keyof typeof SHAPES]) ?? ''))),
    '',
    'Skills, the guides of the folders each writes:',
    ...Object.entries(SKILLS).map(([skill, folders]) => row(skill, joined(folders))),
  ].join('\n');
}

/** What `seefore guide` prints for a topic: a folder, a skill, or with none the topics. A skill that shares its name with a folder is the skill, whose guide holds the folder's. */
export function guideText(topic?: string): { text: string } | { error: string } {
  if (topic === undefined || topic === '') return { text: index() };
  const skill = SKILLS[topic];
  if (skill !== undefined) {
    const where = "The folders lie in the model's folder, the one that holds `seefore.yaml`.";
    const head = wrap(skill.length === 1 ? `The skill ${topic} writes the folder ${skill[0]}. ${where} Its guide follows.` : `The skill ${topic} writes the folders ${joined(skill)}. ${where} The guide of each follows.`, 0);
    return { text: [...head, ...skill.map((folder) => `\n${folderGuide(folder)}`)].join('\n') };
  }
  if (FOLDERS.includes(topic)) return { text: folderGuide(topic) };
  const quoted = (words: readonly string[]) => joined(words.map((each) => `\`${each}\``));
  return { error: `There is no topic \`${topic}\`. The topics are the folders ${quoted(FOLDERS)}, and the skills ${quoted(Object.keys(SKILLS))}.` };
}
