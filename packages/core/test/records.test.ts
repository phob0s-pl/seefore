import { describe, expect, it } from 'vitest';
import { load } from '../src/load.ts';
import type { SourceFile } from '../src/load.ts';
import { ConnectionSchema } from '../src/records.ts';

/**
 * What one record's file may hold. Each record here is tried in a directory that has every
 * record it may name, so that the only problems are those of its own shape.
 */
const AROUND: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'people/customer.yaml', text: 'name: Customer\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\n' },
  { path: 'systems/card-provider.yaml', text: 'name: Card provider\n' },
  { path: 'apps/order-api.yaml', text: 'name: Order API\nin: shop\n' },
  { path: 'infrastructure/proxy.yaml', text: 'name: HTTPS proxy\n' },
  { path: 'owners/shop-team.yaml', text: 'name: Shop team\n' },
  { path: 'technologies/go.yaml', text: 'name: Go\n' },
  { path: 'technologies/https.yaml', text: 'name: HTTPS\n' },
];

/** The least each family needs, and what one of its records is called. */
const FAMILIES = [
  { folder: 'people', noun: 'person', least: 'name: A person\n' },
  { folder: 'systems', noun: 'system', least: 'name: A system\n' },
  { folder: 'apps', noun: 'app', least: 'name: An app\nin: shop\n' },
  { folder: 'stores', noun: 'store', least: 'name: A store\nin: shop\n' },
  { folder: 'components', noun: 'component', least: 'name: A component\nin: order-api\n' },
  { folder: 'infrastructure', noun: 'piece of infrastructure', least: 'name: A piece of infrastructure\n' },
  { folder: 'connections', noun: 'connection', least: 'from: customer\nto: shop\n' },
  { folder: 'owners', noun: 'owner', least: 'name: An owner\n' },
  { folder: 'technologies', noun: 'technology', least: 'name: A technology\n' },
];

const NAMED = FAMILIES.filter((family) => family.folder !== 'connections');

/** The problems of one record's file, each as `line:column code message`. */
function problemsOf(path: string, text: string): string[] {
  const loaded = load([...AROUND, { path, text }]);
  return loaded.problems.filter((problem) => problem.file === path).map((problem) => `${problem.line}:${problem.column} ${problem.code} ${problem.message}`);
}

/** The same, each as `line:column code` alone. */
function codesOf(path: string, text: string): string[] {
  return problemsOf(path, text).map((problem) => problem.split(' ').slice(0, 2).join(' '));
}

function accepted(path: string, text: string): void {
  expect(problemsOf(path, text)).toEqual([]);
}

describe('the records of format 1', () => {
  it.each(FAMILIES)('takes the least a record of $folder needs, and puts it in the model', ({ folder, least }) => {
    const loaded = load([...AROUND, { path: `${folder}/thing.yaml`, text: least }]);
    expect(loaded.problems).toEqual([]);
    const family = (loaded.model as unknown as Record<string, { id: string; file: string }[]>)[folder];
    expect(family?.find((record) => record.id === 'thing')).toMatchObject({ id: 'thing', file: `${folder}/thing.yaml` });
  });

  it('gives the model each record typed, with its id and file first and its keys in the order of the format', () => {
    const loaded = load([
      ...AROUND,
      { path: 'apps/storefront.yaml', text: 'technology: [go]\nkind: browser\nowner: shop-team\ndescription: Where a customer pays.\nin: shop\nname: Storefront\n' },
    ]);
    const app = loaded.model.apps.find((record) => record.id === 'storefront');
    expect(app).toEqual({
      id: 'storefront',
      file: 'apps/storefront.yaml',
      name: 'Storefront',
      in: 'shop',
      description: 'Where a customer pays.',
      kind: 'browser',
      technology: ['go'],
      owner: 'shop-team',
    });
    expect(Object.keys(app ?? {})).toEqual(['id', 'file', 'name', 'in', 'description', 'kind', 'technology', 'owner']);
  });

  it('reads a record of the wrong shape, reports it, and leaves it out of the model', () => {
    const loaded = load([...AROUND, { path: 'apps/storefront.yaml', text: 'name: Storefront\nin: shop\ncolour: blue\n' }]);
    expect(loaded.records.map((record) => record.id)).toContain('storefront');
    expect(loaded.model.apps.map((record) => record.id)).toEqual(['order-api']);
  });
});

describe('the keys a record may have', () => {
  it.each([
    ['people', 'person', '`name`, `only` and `description`'],
    ['systems', 'system', '`name`, `only`, `description`, `external` and `owner`'],
    ['apps', 'app', '`name`, `in`, `only`, `description`, `kind`, `technology` and `owner`'],
    ['stores', 'store', '`name`, `in`, `only`, `description`, `kind`, `technology` and `owner`'],
    ['components', 'component', '`name`, `in`, `only`, `description`, `technology` and `owner`'],
    ['infrastructure', 'piece of infrastructure', '`name`, `in`, `only`, `description`, `technology` and `owner`'],
    ['connections', 'connection', '`from`, `to`, `via`, `opens`, `access`, `name`, `only`, `description` and `technology`'],
    ['owners', 'owner', '`name` and `description`'],
    ['technologies', 'technology', '`name` and `description`'],
  ])('refuses a key %s do not have, at the key, and names the ones they have', (folder, noun, keys) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(problemsOf(`${folder}/thing.yaml`, `${least}colour: blue\n`)).toEqual([
      `${least.split('\n').length}:1 key-unknown \`colour\` is not a key of this ${noun}. Its keys are ${keys}.`,
    ]);
  });

  it('gives a person no owner', () => {
    expect(problemsOf('people/clerk.yaml', 'name: Clerk\nowner: shop-team\n')).toEqual([
      '2:1 key-unknown `owner` is not a key of this person. Its keys are `name`, `only` and `description`.',
    ]);
  });

  it.each(['connections', 'owners', 'technologies'])('gives no owner to a record in %s', (folder) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(codesOf(`${folder}/thing.yaml`, `${least}owner: shop-team\n`)).toEqual([`${least.split('\n').length}:1 key-unknown`]);
  });

  it.each(['people', 'systems', 'components', 'infrastructure', 'connections', 'owners', 'technologies'])('gives no kind to a record in %s', (folder) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(codesOf(`${folder}/thing.yaml`, `${least}kind: service\n`)).toEqual([`${least.split('\n').length}:1 key-unknown`]);
  });

  it.each(['people', 'systems', 'owners', 'technologies'])('gives no technology to a record in %s', (folder) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(codesOf(`${folder}/thing.yaml`, `${least}technology: [go]\n`)).toEqual([`${least.split('\n').length}:1 key-unknown`]);
  });

  it.each(['people', 'systems', 'connections', 'owners', 'technologies'])('gives no `in` to a record in %s', (folder) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(codesOf(`${folder}/thing.yaml`, `${least}in: shop\n`)).toEqual([`${least.split('\n').length}:1 key-unknown`]);
  });

  it('keeps `from` and `to` to connections', () => {
    expect(codesOf('apps/thing.yaml', 'name: Thing\nin: shop\nfrom: customer\nto: shop\n')).toEqual(['3:1 key-unknown', '4:1 key-unknown']);
  });

  it('keeps `via` to connections, and `external` to systems', () => {
    expect(codesOf('apps/thing.yaml', 'name: Thing\nin: shop\nvia: [proxy]\n')).toEqual(['3:1 key-unknown']);
    expect(codesOf('infrastructure/thing.yaml', 'name: Thing\nvia: [proxy]\n')).toEqual(['2:1 key-unknown']);
    for (const folder of ['people', 'apps', 'stores', 'components', 'infrastructure', 'connections', 'owners', 'technologies']) {
      const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
      expect(codesOf(`${folder}/thing.yaml`, `${least}external: true\n`), folder).toEqual([`${least.split('\n').length}:1 key-unknown`]);
    }
  });

  it('keeps `access` and `opens` to connections', () => {
    for (const folder of ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure', 'owners', 'technologies']) {
      const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
      const at = `${least.split('\n').length}:1 key-unknown`;
      expect(codesOf(`${folder}/thing.yaml`, `${least}access: read\n`), folder).toEqual([at]);
      expect(codesOf(`${folder}/thing.yaml`, `${least}opens: to\n`), folder).toEqual([at]);
    }
  });

  it.each(['owners', 'technologies'])('gives no `only` to a record in %s', (folder) => {
    const least = FAMILIES.find((family) => family.folder === folder)?.least ?? '';
    expect(codesOf(`${folder}/thing.yaml`, `${least}only: in the hosted edition\n`)).toEqual([`${least.split('\n').length}:1 key-unknown`]);
  });
});

describe('`name`', () => {
  it.each(NAMED)('is required on a record in $folder', ({ folder, noun, least }) => {
    const rest = least.replace(/^name: .*\n/, '');
    expect(problemsOf(`${folder}/thing.yaml`, `description: Something.\n${rest}`)).toEqual([`1:1 key-missing \`name\` is missing from this ${noun}.`]);
  });

  it('may be left off a connection', () => {
    accepted('connections/thing.yaml', 'from: customer\nto: shop\n');
    accepted('connections/thing.yaml', 'from: customer\nto: shop\nname: Buys things\n');
  });

  it.each([
    ['one character', 'A'],
    ['a hundred characters', 'x'.repeat(100)],
    ['words with spaces between', 'Order events from the shop'],
    ['letters beyond English', 'Zamówienia i płatności'],
    ['quotes', '"Shop"'],
  ])('takes %s', (_what, name) => {
    accepted('systems/thing.yaml', `name: ${name}\n`);
    accepted('connections/thing.yaml', `from: customer\nto: shop\nname: ${name}\n`);
  });

  it.each([
    ['an empty name', 'name: ""\n', '1:7 value-too-small `name` is empty.'],
    ['a name of spaces only', 'name: "   "\n', '1:7 value-too-small `name` is empty.'],
    ['a name on two lines', 'name: "Order\\nevents"\n', '1:7 value-invalid `name` must be on one line.'],
    ['a name with a carriage return', 'name: "Order\\revents"\n', '1:7 value-invalid `name` must be on one line.'],
    ['a name split by a line separator', 'name: "Order\\Levents"\n', '1:7 value-invalid `name` must be on one line.'],
    ['a name split by a paragraph separator', 'name: "Order\\Pevents"\n', '1:7 value-invalid `name` must be on one line.'],
    ['a name split by a next-line character', 'name: "Order\\Nevents"\n', '1:7 value-invalid `name` must be on one line.'],
    ['a name that ends in a line break', 'name: |\n  Order events\n', '1:7 value-invalid `name` must be on one line.'],
    ['a space at the start', 'name: " Shop"\n', '1:7 value-invalid `name` starts or ends with a space. Take the space off.'],
    ['a space at the end', 'name: "Shop "\n', '1:7 value-invalid `name` starts or ends with a space. Take the space off.'],
    ['a tab at the end', 'name: "Shop\\t"\n', '1:7 value-invalid `name` starts or ends with a space. Take the space off.'],
    ['a name that is too long', `name: ${'x'.repeat(101)}\n`, '1:7 value-too-big `name` has 101 characters. It may have at most 100.'],
    ['a number', 'name: 42\n', '1:7 value-wrong-kind `name` must be text, but this is a whole number.'],
    ['nothing', 'name:\n', '1:6 value-wrong-kind `name` must be text, but this is empty.'],
    ['a list', 'name: [Shop]\n', '1:7 value-wrong-kind `name` must be text, but this is a list.'],
  ])('refuses %s, at the value', (_what, text, problem) => {
    expect(problemsOf('systems/thing.yaml', text)).toEqual([problem]);
  });

  it('counts a character outside the first plane of Unicode once, as the limit does', () => {
    accepted('systems/thing.yaml', `name: ${'🛒'.repeat(100)}\n`);
    expect(problemsOf('systems/thing.yaml', `name: ${'x'.repeat(99)}🛒🛒\n`)).toEqual(['1:7 value-too-big `name` has 101 characters. It may have at most 100.']);
  });

  it('holds the name of a connection to the same rule', () => {
    expect(problemsOf('connections/thing.yaml', 'from: customer\nto: shop\nname: " Buys"\n')).toEqual([
      '3:7 value-invalid `name` starts or ends with a space. Take the space off.',
    ]);
    expect(codesOf('connections/thing.yaml', `from: customer\nto: shop\nname: ${'x'.repeat(101)}\n`)).toEqual(['3:7 value-too-big']);
  });
});

describe('`description`', () => {
  it.each(FAMILIES)('may be left off, or given, on a record in $folder', ({ folder, least }) => {
    accepted(`${folder}/thing.yaml`, least);
    accepted(`${folder}/thing.yaml`, `${least}description: What it is for.\n`);
  });

  it('takes several lines, and two thousand characters', () => {
    accepted('systems/thing.yaml', 'name: Shop\ndescription: |\n  Sells goods.\n\n  Ships them too.\n');
    accepted('systems/thing.yaml', `name: Shop\ndescription: ${'x'.repeat(2000)}\n`);
  });

  it.each([
    ['an empty description', 'description: ""\n', '2:14 value-too-small `description` is empty. Leave it out until there is something to say.'],
    ['spaces and line breaks only', 'description: " \\n "\n', '2:14 value-too-small `description` is empty. Leave it out until there is something to say.'],
    ['one that is too long', `description: ${'x'.repeat(2001)}\n`, '2:14 value-too-big `description` has 2001 characters. It may have at most 2000.'],
    ['a number', 'description: 7\n', '2:14 value-wrong-kind `description` must be text, but this is a whole number.'],
    ['nothing', 'description:\n', '2:13 value-wrong-kind `description` must be text, but this is empty.'],
  ])('refuses %s, at the value', (_what, text, problem) => {
    expect(problemsOf('systems/thing.yaml', `name: Shop\n${text}`)).toEqual([problem]);
  });
});

describe('`in`', () => {
  it.each([
    ['apps', 'app'],
    ['stores', 'store'],
    ['components', 'component'],
  ])('is required on a record in %s', (folder, noun) => {
    expect(problemsOf(`${folder}/thing.yaml`, 'name: Thing\n')).toEqual([`1:1 key-missing \`in\` is missing from this ${noun}.`]);
  });

  const inSystem = '`in` holds the id of the system it is part of, a record in `systems/`.';

  it.each([
    ['text that is not an id', 'in: Shop\n', `2:5 value-invalid ${inSystem} \`Shop\` is not an id: an id is written in lowercase, like \`shop\`.`],
    ['a name with a space, with no id made from it', 'in: "the shop"\n', `2:5 value-invalid ${inSystem} An id has no spaces: it is the name of the system's file, without \`.yaml\`.`],
    ['empty text', 'in: ""\n', `2:5 value-invalid ${inSystem} An id cannot be empty.`],
    ['a number', 'in: 3\n', '2:5 value-wrong-kind `in` must be text, but this is a whole number.'],
    ['a list', 'in: [shop]\n', '2:5 value-wrong-kind `in` must be text, but this is a list.'],
  ])('refuses %s, at the value', (_what, text, problem) => {
    expect(problemsOf('apps/thing.yaml', `name: Thing\n${text}`)).toEqual([problem]);
  });

  it('says what `in` holds for each kind of record', () => {
    expect(problemsOf('stores/thing.yaml', 'name: Thing\nin: The Shop\n')).toEqual([
      '2:5 value-invalid `in` holds the id of the system it is part of, a record in `systems/`, or of the app that keeps it, a record in `apps/`. ' +
        "An id has no spaces: it is the name of that record's file, without `.yaml`.",
    ]);
    expect(problemsOf('components/thing.yaml', 'name: Thing\nin: Order API\n')).toEqual([
      "2:5 value-invalid `in` holds the id of the app it is inside, a record in `apps/`. An id has no spaces: it is the name of the app's file, without `.yaml`.",
    ]);
    expect(problemsOf('infrastructure/thing.yaml', 'name: Thing\nin: The Shop\n')).toEqual([
      `2:5 value-invalid ${inSystem} An id has no spaces: it is the name of the system's file, without \`.yaml\`.`,
    ]);
  });

  it('may be left off a piece of infrastructure, or name its system, and goes to the model in the order of the format', () => {
    accepted('infrastructure/thing.yaml', 'name: Thing\n');
    accepted('infrastructure/thing.yaml', 'name: Thing\nin: shop\n');
    const loaded = load([...AROUND, { path: 'infrastructure/ingress.yaml', text: 'owner: shop-team\nin: shop\nname: Ingress\n' }]);
    const piece = loaded.model.infrastructure.find((record) => record.id === 'ingress');
    expect(piece).toEqual({ id: 'ingress', file: 'infrastructure/ingress.yaml', name: 'Ingress', in: 'shop', owner: 'shop-team' });
    expect(Object.keys(piece ?? {})).toEqual(['id', 'file', 'name', 'in', 'owner']);
  });

  it('may name the app that keeps a store', () => {
    const loaded = load([...AROUND, { path: 'stores/index-database.yaml', text: 'name: Index database\nin: order-api\nkind: database\n' }]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.stores).toEqual([{ id: 'index-database', file: 'stores/index-database.yaml', name: 'Index database', in: 'order-api', kind: 'database' }]);
  });

  it('refuses what is not an id on a piece of infrastructure, as on an app', () => {
    expect(codesOf('infrastructure/thing.yaml', 'name: Thing\nin: [shop]\n')).toEqual(['2:5 value-wrong-kind']);
    expect(codesOf('infrastructure/thing.yaml', 'name: Thing\nin: ""\n')).toEqual(['2:5 value-invalid']);
  });
});

describe('`kind`', () => {
  it.each(['service', 'browser', 'mobile', 'desktop', 'command', 'function', 'job'])('takes %s for an app', (kind) => {
    accepted('apps/thing.yaml', `name: Thing\nin: shop\nkind: ${kind}\n`);
  });

  it.each(['database', 'files', 'cache', 'index', 'queue', 'topic'])('takes %s for a store', (kind) => {
    accepted('stores/thing.yaml', `name: Thing\nin: shop\nkind: ${kind}\n`);
  });

  it('refuses any other kind of app, and names the kinds there are', () => {
    expect(problemsOf('apps/thing.yaml', 'name: Thing\nin: shop\nkind: server\n')).toEqual([
      '3:7 value-not-allowed `kind` must be one of `service`, `browser`, `mobile`, `desktop`, `command`, `function` and `job`.',
    ]);
    expect(codesOf('apps/thing.yaml', 'name: Thing\nin: shop\nkind: database\n')).toEqual(['3:7 value-not-allowed']);
    expect(codesOf('apps/thing.yaml', 'name: Thing\nin: shop\nkind: Service\n')).toEqual(['3:7 value-not-allowed']);
  });

  it('refuses any other kind of store, and names the kinds there are', () => {
    expect(problemsOf('stores/thing.yaml', 'name: Thing\nin: shop\nkind: server\n')).toEqual([
      '3:7 value-not-allowed `kind` must be one of `database`, `files`, `cache`, `index`, `queue` and `topic`.',
    ]);
    expect(codesOf('stores/thing.yaml', 'name: Thing\nin: shop\nkind: service\n')).toEqual(['3:7 value-not-allowed']);
    expect(codesOf('stores/thing.yaml', 'name: Thing\nin: shop\nkind: 3\n')).toEqual(['3:7 value-not-allowed']);
    expect(codesOf('stores/thing.yaml', 'name: Thing\nin: shop\nkind: stream\n')).toEqual(['3:7 value-not-allowed']);
  });

  it('gives the model a queue and a topic as kinds of store, as they are written', () => {
    const loaded = load([
      ...AROUND,
      { path: 'stores/jobs.yaml', text: 'name: Jobs\nin: shop\nkind: queue\ntechnology: [go]\n' },
      { path: 'stores/order-events.yaml', text: 'name: Order events\nin: shop\nkind: topic\n' },
    ]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.stores).toEqual([
      { id: 'jobs', file: 'stores/jobs.yaml', name: 'Jobs', in: 'shop', kind: 'queue', technology: ['go'] },
      { id: 'order-events', file: 'stores/order-events.yaml', name: 'Order events', in: 'shop', kind: 'topic' },
    ]);
  });

  it('says nothing of a queue to an app', () => {
    expect(problemsOf('apps/thing.yaml', 'name: Thing\nin: shop\nkind: queue\n')).toEqual([
      '3:7 value-not-allowed `kind` must be one of `service`, `browser`, `mobile`, `desktop`, `command`, `function` and `job`.',
    ]);
  });

  it('gives the model a store kind as it is written', () => {
    const loaded = load([...AROUND, { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\nkind: database\n' }]);
    expect(loaded.model.stores).toEqual([{ id: 'orders', file: 'stores/orders.yaml', name: 'Orders', in: 'shop', kind: 'database' }]);
  });
});

describe('`technology`', () => {
  it.each([
    ['apps', 'name: Thing\nin: shop\n'],
    ['stores', 'name: Thing\nin: shop\n'],
    ['components', 'name: Thing\nin: order-api\n'],
    ['infrastructure', 'name: Thing\n'],
    ['connections', 'from: customer\nto: shop\n'],
  ])('takes a list of ids on a record in %s, in either way of writing a list', (folder, least) => {
    accepted(`${folder}/thing.yaml`, `${least}technology: [go]\n`);
    accepted(`${folder}/thing.yaml`, `${least}technology: [go, https]\n`);
    accepted(`${folder}/thing.yaml`, `${least}technology:\n  - https\n  - go\n`);
  });

  it.each([
    ['an empty list', 'technology: []\n', '3:13 value-too-small `technology` is an empty list. Leave it out until a technology is known.'],
    ['one id that is not in a list', 'technology: go\n', '3:13 value-wrong-kind `technology` must be a list, but this is text.'],
    ['an id written twice, at the second', 'technology: [go, https, go]\n', '3:25 value-invalid `go` is in `technology` twice. Keep one.'],
    [
      'an item with a space, with no id made from it, at the item',
      'technology: [go, Go Lang]\n',
      '3:18 value-invalid The second id in `technology`, `Go Lang`, is not the id of a technology. ' +
        'Name a technology by the id of its record in `technologies/`, and say anything more in the description.',
    ],
    [
      'an item that is an id but for a slip, with the id it was meant to be',
      'technology: [go, Redis]\n',
      '3:18 value-invalid The second id in `technology`, `Redis`, is not an id: an id is written in lowercase, like `redis`.',
    ],
    ['an item that is not text', 'technology: [go, 3]\n', '3:18 value-wrong-kind The second id in `technology` must be text, but this is a whole number.'],
  ])('refuses %s', (_what, text, problem) => {
    expect(problemsOf('apps/thing.yaml', `name: Thing\nin: shop\n${text}`)).toEqual([problem]);
  });

  it('says that a phrase about how an exchange travels goes in the description of a connection', () => {
    expect(problemsOf('connections/thing.yaml', 'from: customer\nto: shop\ntechnology: [go, by hand]\n')).toEqual([
      '3:18 value-invalid The second id in `technology`, `by hand`, is not the id of a technology. ' +
        'A phrase about how an exchange travels goes in the description.',
    ]);
  });

  it('names an item by its place in words up to the tenth, and by its number after', () => {
    const ten = ['go', 'https', 'go', 'https', 'go', 'https', 'go', 'https', 'go', 'https'];
    const tenth = [...ten.slice(0, 9), 7];
    expect(problemsOf('apps/thing.yaml', `name: Thing\nin: shop\ntechnology: [${tenth.join(', ')}]\n`).map((problem) => problem.split(' value-wrong-kind ')[1])).toContain(
      'The tenth id in `technology` must be text, but this is a whole number.',
    );
    const eleventh = [...ten, 7];
    expect(problemsOf('apps/thing.yaml', `name: Thing\nin: shop\ntechnology: [${eleventh.join(', ')}]\n`).map((problem) => problem.split(' value-wrong-kind ')[1])).toContain(
      'Id 11 in `technology` must be text, but this is a whole number.',
    );
  });
});

describe('`owner`', () => {
  it.each([
    ['systems', 'name: Thing\n'],
    ['apps', 'name: Thing\nin: shop\n'],
    ['stores', 'name: Thing\nin: shop\n'],
    ['components', 'name: Thing\nin: order-api\n'],
    ['infrastructure', 'name: Thing\n'],
  ])('may be left off, or given, on a record in %s', (folder, least) => {
    accepted(`${folder}/thing.yaml`, least);
    accepted(`${folder}/thing.yaml`, `${least}owner: shop-team\n`);
  });

  it('refuses what is not an id, at the value', () => {
    expect(problemsOf('systems/thing.yaml', 'name: Thing\nowner: Shop team\n')).toEqual([
      '2:8 value-invalid `owner` holds the id of a record in `owners/`. ' +
        'If who answers takes a sentence to say, leave `owner` out and put the sentence in the description.',
    ]);
    expect(codesOf('systems/thing.yaml', 'name: Thing\nowner: [shop-team]\n')).toEqual(['2:8 value-wrong-kind']);
  });

  it('never answers a sentence with an id made from its words', () => {
    expect(problemsOf('apps/thing.yaml', 'name: Thing\nin: shop\nowner: Two teams argue\n')).toEqual([
      '3:8 value-invalid `owner` holds the id of a record in `owners/`. ' +
        'If who answers takes a sentence to say, leave `owner` out and put the sentence in the description. ' +
        'Left out, the owner is taken from what the part is in: check that this is true.',
    ]);
  });

  it('says that a part with `owner` left out takes the owner of what it is in, a piece of infrastructure its system\'s, and a system nothing', () => {
    const takes = 'Left out, the owner is taken from what the part is in: check that this is true.';
    expect(problemsOf('stores/thing.yaml', 'name: Thing\nin: shop\nowner: Two teams argue\n')[0]).toContain(takes);
    expect(problemsOf('components/thing.yaml', 'name: Thing\nin: order-api\nowner: Two teams argue\n')[0]).toContain(takes);
    expect(problemsOf('systems/thing.yaml', 'name: Thing\nowner: Two teams argue\n')[0]).not.toContain('Left out');
    expect(problemsOf('infrastructure/thing.yaml', 'name: Thing\nowner: Two teams argue\n')).toEqual([
      '2:8 value-invalid `owner` holds the id of a record in `owners/`. ' +
        'If who answers takes a sentence to say, leave `owner` out and put the sentence in the description. ' +
        'Left out, the owner is taken from the system the piece is in, when it is in one: check that this is true.',
    ]);
  });

  it('answers a slip in an id with the id it was meant to be', () => {
    expect(problemsOf('systems/thing.yaml', 'name: Thing\nowner: Shop-Team\n')).toEqual([
      '2:8 value-invalid `owner` holds the id of a record in `owners/`. `Shop-Team` is not an id: an id is written in lowercase, like `shop-team`.',
    ]);
  });

  it('never offers an id that is itself not allowed', () => {
    expect(problemsOf('apps/thing.yaml', 'name: Thing\nin: shop\nowner: Con\n')).toEqual([
      '3:8 value-invalid `owner` holds the id of a record in `owners/`. `Con` is not an id: an id is written in lowercase, like `order-events`.',
    ]);
  });
});

describe('`from` and `to`', () => {
  it('are both required on a connection', () => {
    expect(problemsOf('connections/thing.yaml', 'to: shop\n')).toEqual(['1:1 key-missing `from` is missing from this connection.']);
    expect(problemsOf('connections/thing.yaml', 'from: customer\n')).toEqual(['1:1 key-missing `to` is missing from this connection.']);
  });

  it('may both name one record: copies of one app that talk to each other', () => {
    accepted('connections/thing.yaml', 'from: order-api\nto: order-api\nname: Shares the load\n');
  });

  it('refuses what is not an id, at the value', () => {
    expect(problemsOf('connections/thing.yaml', 'from: Customer\nto: shop\n')).toEqual([
      '1:7 value-invalid `from` holds the id of the one that acts: a person, a system, an app, a store, a component or a piece of infrastructure. ' +
        '`Customer` is not an id: an id is written in lowercase, like `customer`.',
    ]);
    expect(problemsOf('connections/thing.yaml', 'from: customer\nto: The shop\n')).toEqual([
      '2:5 value-invalid `to` holds the id of the one it acts on: a person, a system, an app, a store, a component or a piece of infrastructure. ' +
        "An id has no spaces: it is the name of that record's file, without `.yaml`.",
    ]);
    expect(codesOf('connections/thing.yaml', 'from: customer\nto: 12\n')).toEqual(['2:5 value-wrong-kind']);
  });
});

describe('`via`', () => {
  it('takes a list of ids, in either way of writing a list, and gives it to the model in its order', () => {
    accepted('connections/thing.yaml', 'from: customer\nto: card-provider\nvia: [proxy]\n');
    accepted('connections/thing.yaml', 'from: customer\nto: card-provider\nvia:\n  - proxy\n  - order-api\n');
    const loaded = load([...AROUND, { path: 'connections/thing.yaml', text: 'from: customer\nto: card-provider\nvia: [order-api, proxy]\nname: Pays\n' }]);
    expect(loaded.model.connections).toEqual([
      { id: 'thing', file: 'connections/thing.yaml', from: 'customer', to: 'card-provider', via: ['order-api', 'proxy'], name: 'Pays' },
    ]);
  });

  it.each([
    ['an empty list', 'via: []\n', '3:6 value-too-small `via` is an empty list. Leave `via` out until something that is always on the way is known.'],
    ['one id that is not in a list', 'via: proxy\n', '3:6 value-wrong-kind `via` must be a list, but this is text.'],
    ['an id written twice, at the second', 'via: [proxy, order-api, proxy]\n', '3:25 value-invalid `proxy` is in `via` twice. Keep one.'],
    [
      'an item with a space, with no id made from it, at the item',
      'via: [proxy, the gateway]\n',
      '3:14 value-invalid The second id in `via`, `the gateway`, is not an id. ' +
        '`via` holds the ids of what the exchange passes through, nearest to `from` first. Say anything more in the description.',
    ],
    ['an item that is an id but for a slip', 'via: [Proxy]\n', '3:7 value-invalid The first id in `via`, `Proxy`, is not an id: an id is written in lowercase, like `proxy`.'],
    ['an item that is not text', 'via: [proxy, 3]\n', '3:14 value-wrong-kind The second id in `via` must be text, but this is a whole number.'],
  ])('refuses %s', (_what, text, problem) => {
    expect(problemsOf('connections/thing.yaml', `from: customer\nto: card-provider\n${text}`)).toEqual([problem]);
  });
});

describe('`external`', () => {
  it('takes `true` on a system, and gives it to the model', () => {
    const loaded = load([...AROUND, { path: 'systems/payments.yaml', text: 'name: Payments\ndescription: Takes card payments.\nexternal: true\n' }]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.systems.find((system) => system.id === 'payments')).toEqual({
      id: 'payments',
      file: 'systems/payments.yaml',
      name: 'Payments',
      description: 'Takes card payments.',
      external: true,
    });
  });

  it.each([
    ['`false`', 'external: false\n'],
    ['text', 'external: yes please\n'],
    ['a number', 'external: 1\n'],
  ])('refuses %s, at the value, and says what to do for a system that is not external', (_what, text) => {
    expect(problemsOf('systems/thing.yaml', `name: Thing\n${text}`)).toEqual([
      '2:11 value-not-allowed `external` must be `true`. Leave it out for a system of yours, and for one nobody has spoken for.',
    ]);
  });
});

describe('`only`', () => {
  const WITH_ONLY = FAMILIES.filter((family) => family.folder !== 'owners' && family.folder !== 'technologies');

  it.each(WITH_ONLY)('may be left off, or given, on a record in $folder, and goes to the model as it is written', ({ folder, least }) => {
    accepted(`${folder}/thing.yaml`, least);
    const loaded = load([...AROUND, { path: `${folder}/thing.yaml`, text: `${least}only: in the hosted edition\n` }]);
    expect(loaded.problems).toEqual([]);
    const family = (loaded.model as unknown as Record<string, { id: string; only?: string }[]>)[folder];
    expect(family?.find((record) => record.id === 'thing')?.only).toBe('in the hosted edition');
  });

  it.each([
    ['one character', 'x'],
    ['a hundred characters', 'x'.repeat(100)],
    ['a hundred characters outside the first plane of Unicode, each counted once', '🛒'.repeat(100)],
    ['words with commas', 'when LDAP is configured, so not on GitLab.com or Dedicated'],
  ])('takes %s', (_what, only) => {
    accepted('connections/thing.yaml', `from: customer\nto: shop\nonly: ${only}\n`);
  });

  it.each([
    [
      'words that are too long, with what to do',
      `only: ${'x'.repeat(101)}\n`,
      '3:7 value-too-big `only` has 101 characters. It may have at most 100. Keep the words that say when, and say the rest in the description.',
    ],
    ['empty words', 'only: ""\n', '3:7 value-too-small `only` is empty. Leave it out when the thing is always there, and when nobody has said.'],
    ['spaces only', 'only: "   "\n', '3:7 value-too-small `only` is empty. Leave it out when the thing is always there, and when nobody has said.'],
    [
      'words on two lines',
      'only: "in the hosted\\nedition"\n',
      '3:7 value-invalid `only` must be on one line: the few words that read after "only". Say the rest in the description.',
    ],
    [
      'words that end in a line break',
      'only: |\n  in the hosted edition\n',
      '3:7 value-invalid `only` must be on one line: the few words that read after "only". Say the rest in the description.',
    ],
    ['a space at the start', 'only: " in production"\n', '3:7 value-invalid `only` starts or ends with a space. Take the space off.'],
    ['a tab at the end', 'only: "in production\\t"\n', '3:7 value-invalid `only` starts or ends with a space. Take the space off.'],
    ['a number', 'only: 3\n', '3:7 value-wrong-kind `only` must be text, but this is a whole number.'],
    ['a list', 'only: [in production]\n', '3:7 value-wrong-kind `only` must be text, but this is a list.'],
  ])('refuses %s, at the value', (_what, text, problem) => {
    expect(problemsOf('connections/thing.yaml', `from: customer\nto: shop\n${text}`)).toEqual([problem]);
  });

  it('holds every record that may have it to the same form', () => {
    for (const { folder, least } of WITH_ONLY) {
      const line = least.split('\n').length;
      expect(codesOf(`${folder}/thing.yaml`, `${least}only: ""\n`), folder).toEqual([`${line}:7 value-too-small`]);
    }
  });
});

describe('`access`', () => {
  /** A connection's file, tried beside a store for it to end at. */
  const ORDERS: SourceFile = { path: 'stores/orders.yaml', text: 'name: Orders\nin: shop\n' };
  const tried = (text: string) => load([...AROUND, ORDERS, { path: 'connections/thing.yaml', text }]);

  it.each(['read', 'write', 'read-write'])('takes %s on a connection, and gives it to the model', (access) => {
    const loaded = tried(`from: order-api\nto: orders\naccess: ${access}\n`);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.connections[0]?.access).toBe(access);
  });

  it.each([
    ['another word', 'access: readwrite\n', '3:9'],
    ['a word in capitals', 'access: Read\n', '3:9'],
    ['both as a list', 'access: [read, write]\n', '3:9'],
    ['`true`', 'access: true\n', '3:9'],
    ['nothing', 'access:\n', '3:8'],
  ])('refuses %s, at the value, and says what is allowed and what leaving it out means', (_what, text, place) => {
    expect(tried(`from: order-api\nto: orders\n${text}`).problems.map((problem) => `${problem.line}:${problem.column} ${problem.code} ${problem.message}`)).toEqual([
      `${place} value-not-allowed \`access\` must be \`read\`, \`write\` or \`read-write\`: what the connection does to the data of the store it ends at. ` +
        'Leave it out for a use that is neither, and when nobody has said.',
    ]);
  });
});

describe('`opens`', () => {
  it('takes `to` on a connection, and gives it to the model', () => {
    const loaded = load([...AROUND, { path: 'connections/thing.yaml', text: 'from: order-api\nto: customer\nvia: [proxy]\nopens: to\n' }]);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.connections[0]?.opens).toBe('to');
  });

  it.each([
    ['`from`', 'opens: from\n'],
    ['`true`', 'opens: true\n'],
    ['the id of the far end', 'opens: shop\n'],
  ])('refuses %s, at the value, and says what is allowed and what leaving it out means', (_what, text) => {
    expect(problemsOf('connections/thing.yaml', `from: customer\nto: shop\n${text}`)).toEqual([
      '3:8 value-not-allowed `opens` must be `to`: the channel this exchange travels down was opened from the far side. ' +
        'Leave it out when the one that sends opened it, and when nobody has said.',
    ]);
  });
});

describe('the order of keys', () => {
  it('reads a connection with every key into the order of the format, however its file writes them', () => {
    // `access` and `opens` never stand on one sound connection, since one ends at a store and the
    // other does not, so the schema is tried by itself.
    const read = ConnectionSchema.parse({
      technology: ['https'],
      description: 'Down a watch stream.',
      only: 'when the agent is on',
      name: 'Sends changes',
      access: 'write',
      opens: 'to',
      via: ['proxy'],
      to: 'shop',
      from: 'customer',
    });
    expect(Object.keys(read)).toEqual(['from', 'to', 'via', 'opens', 'access', 'name', 'only', 'description', 'technology']);
  });

  it('gives the model a store with `only` after `in` and before `description`', () => {
    const loaded = load([...AROUND, { path: 'stores/thing.yaml', text: 'owner: shop-team\ndescription: Kept rows.\nonly: in production\nin: order-api\nname: Thing\n' }]);
    expect(Object.keys(loaded.model.stores[0] ?? {})).toEqual(['id', 'file', 'name', 'in', 'only', 'description', 'owner']);
  });
});
