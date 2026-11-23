import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDocument } from 'yaml';
import { APP_KINDS, CROWDED_FROM, CURRENT_FORMAT, STORE_KINDS, load } from '@seefore/core';
import type { SourceFile } from '@seefore/core';
import { describe, expect, it } from 'vitest';
import type { z } from 'zod';

/**
 * The model skill and the spec of stage 4 say the same thing as the engine. The skill is the
 * writer's manual and is installed apart from this repository, so nothing else would notice
 * when one of the three moves and the others do not.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const spec = readFileSync(join(root, 'docs/modelling.md'), 'utf8');
const hardCases = readFileSync(join(root, 'docs/hard-cases.md'), 'utf8');
const skill = readFileSync(join(root, 'plugin/skills/model/SKILL.md'), 'utf8');

/** The text between the two marks of a block. */
function block(text: string, name: string): string {
  const from = text.indexOf(`<!-- ${name}:start -->`);
  const to = text.indexOf(`<!-- ${name}:end -->`);
  expect(from, `the start mark of ${name}`).toBeGreaterThanOrEqual(0);
  expect(to, `the end mark of ${name}`).toBeGreaterThan(from);
  return text.slice(from, to);
}

/** The cells of the row of a Markdown table that starts with a given first cell. */
function row(text: string, first: string): string[] {
  const line = text.split('\n').find((candidate) => candidate.startsWith(`| ${first} |`));
  expect(line, `a table row for ${first}`).toBeDefined();
  return (line as string).split('|').slice(1, -1).map((cell) => cell.trim());
}

/** Every word in backticks, in order. */
function inBackticks(text: string): string[] {
  return [...text.matchAll(/`([^`]+)`/g)].map((match) => match[1] as string);
}

/** The keys of a record's schema, in the order they are written, and which of them are required. */
function keysOf(schema: z.ZodType): { key: string; required: boolean }[] {
  const shape = (schema as unknown as { shape: Record<string, z.ZodType> }).shape;
  return Object.entries(shape).map(([key, field]) => ({ key, required: !field.safeParse(undefined).success }));
}

/** Each YAML example that stands under a line naming its file, as that file. */
function examples(text: string): SourceFile[] {
  return [...text.matchAll(/^`([a-z]+\/[a-z0-9-]+\.yaml)`:\n\n```yaml\n([\s\S]*?)```/gm)].map((match) => ({
    path: match[1] as string,
    text: match[2] as string,
  }));
}

/** The records the examples name, so that the only problems left are the examples' own. */
const AROUND: SourceFile[] = [
  { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
  { path: 'systems/shop.yaml', text: 'name: Shop\n' },
  { path: 'systems/card-provider.yaml', text: 'name: Card provider\n' },
  { path: 'components/checkout.yaml', text: 'name: Checkout\nin: order-api\n' },
  { path: 'owners/shop-team.yaml', text: 'name: Shop team\n' },
  { path: 'technologies/go.yaml', text: 'name: Go\n' },
  { path: 'technologies/https.yaml', text: 'name: HTTPS\n' },
];

describe('every skill of the plugin', () => {
  it('starts with front matter that is YAML and gives a name and a description', () => {
    const folder = join(root, 'plugin/skills');
    const skills = readdirSync(folder);
    expect(skills).toContain('model');
    for (const name of skills) {
      const text = readFileSync(join(folder, name, 'SKILL.md'), 'utf8');
      const matter = /^---\n([\s\S]*?)\n---\n/.exec(text)?.[1];
      expect(matter, `the front matter of ${name}`).toBeDefined();
      const doc = parseDocument(matter as string);
      expect(doc.errors.map((fault) => fault.message), `the front matter of ${name}`).toEqual([]);
      const said = doc.toJS() as Record<string, unknown>;
      expect(said['name']).toBe(name);
      expect(typeof said['description']).toBe('string');
      expect((said['description'] as string).length).toBeGreaterThan(40);
    }
  });
});

describe('the model skill', () => {
  it('carries the conventions of the spec word for word', () => {
    const blocks: [string, string][] = [
      ['conventions', spec],
      ['cannot-say-yet', spec],
      ['hard-cases', hardCases],
    ];
    for (const [name, from] of blocks) {
      expect(block(skill, name), `the block ${name}; run \`npm run sync:skill\``).toBe(block(from, name));
    }
  });

  it('lists for each family the keys of its record, in order, with the required ones in bold', () => {
    for (const family of CURRENT_FORMAT.families) {
      if (!family.record) continue;
      const cell = row(skill, `\`${family.folder}/\``)[2] as string;
      const written = cell.split(',').map((part) => part.trim());
      const expected = keysOf(family.record.schema).map(({ key, required }) => (required ? `**\`${key}\`**` : `\`${key}\``));
      expect(written, family.folder).toEqual(expected);
    }
  });

  it('knows the warning of a crowded view by the code the engine gives it, and asks for no record less', () => {
    const apps = Array.from({ length: CROWDED_FROM + 1 }, (_, n): SourceFile => ({ path: `apps/app-${n + 1}.yaml`, text: `name: App ${n + 1}\nin: shop\n` }));
    const shop: SourceFile[] = [
      { path: 'seefore.yaml', text: 'format: 1\nname: Shop\n' },
      { path: 'systems/shop.yaml', text: 'name: Shop\n' },
    ];
    expect(load([...shop, ...apps]).problems.map((problem) => problem.code)).toEqual(['view-crowded']);
    const said = skill.split('\n\n').find((paragraph) => paragraph.startsWith('`view-crowded`')) ?? '';
    expect(said.replace(/\s+/g, ' ')).toContain('Do not propose merging records or leaving any out to get under the limit.');
  });

  it('names the kinds the engine allows, in order', () => {
    const line = skill.split('\n- ').find((item) => item.startsWith('`kind` of an app')) ?? '';
    const [ofApp, ofStore] = line.split('`kind` of a store');
    expect(inBackticks(ofApp ?? '').filter((word) => word !== 'kind')).toEqual([...APP_KINDS]);
    expect(inBackticks(ofStore ?? '').slice(0, STORE_KINDS.length)).toEqual([...STORE_KINDS]);
  });
});

describe('the spec of stage 4', () => {
  it('gives one order of keys, which is the order of every record', () => {
    const line = /The keys are written in this order, and each key starts a line: ([^.]*)\./.exec(spec.replace(/\n\s*/g, ' '))?.[1];
    expect(line).toBeDefined();
    const order = inBackticks(line as string);
    for (const family of CURRENT_FORMAT.families) {
      if (!family.record) continue;
      const keys = keysOf(family.record.schema).map(({ key }) => key);
      expect(order.filter((key) => keys.includes(key)), family.folder).toEqual(keys);
    }
  });

  it('says what a service is in the words the skill uses', () => {
    const flat = (text: string): string => text.replace(/\s+/g, ' ');
    expect(flat(spec)).toContain('`service` is a program that stays up.');
    expect(flat(skill)).toContain('`service` is a program that stays up;');
  });

  it('names the kinds the engine allows, in order', () => {
    expect(inBackticks(row(spec, '`kind`')[2] as string)).toEqual([...APP_KINDS]);
    const ofStore = spec.split('\n').find((line) => line.startsWith('| `kind` | store |')) ?? '';
    expect(inBackticks(ofStore).slice(1)).toEqual([...STORE_KINDS]);
  });
});

describe.each([
  ['the spec', spec],
  ['the skill', skill],
])('the examples of %s', (_where, text) => {
  it('are records the engine reads with no problem', () => {
    const found = examples(text);
    expect(found.map((file) => file.path)).toEqual(['apps/order-api.yaml', 'connections/checkout-takes-payment.yaml']);
    expect(load([...AROUND, ...found]).problems).toEqual([]);
  });

  it('show a folded description that is read whole', () => {
    const folded = /```yaml\n(description: >-\n[\s\S]*?)```/.exec(text)?.[1];
    expect(folded).toBeDefined();
    const files = [...AROUND, { path: 'apps/order-api.yaml', text: `name: Order API\nin: shop\n${folded as string}` }];
    const loaded = load(files);
    expect(loaded.problems).toEqual([]);
    expect(loaded.model.apps[0]?.description).toBe('Takes orders and says how far each has got. Turns away a basket over the limit: see issue #5377.');
  });
});

describe('the examples of the spec of stages 6a and 6b', () => {
  it('are records the engine reads with no problem', () => {
    const around: SourceFile[] = [
      { path: 'seefore.yaml', text: 'format: 1\nname: Archive\n' },
      { path: 'systems/archive.yaml', text: 'name: Archive\n' },
      { path: 'apps/staff-browser.yaml', text: 'name: Staff browser\nin: archive\n' },
      { path: 'apps/desk.yaml', text: 'name: Desk\nin: archive\n' },
      { path: 'technologies/nginx.yaml', text: 'name: nginx\n' },
      { path: 'technologies/https.yaml', text: 'name: HTTPS\n' },
    ];
    const found = examples(hardCases);
    expect(found.map((file) => file.path)).toEqual([
      'infrastructure/proxy.yaml',
      'connections/staff-browser-asks-desk.yaml',
      'systems/card-provider.yaml',
      'stores/drafts.yaml',
      'connections/desk-keeps-drafts.yaml',
      'infrastructure/office-proxy.yaml',
      'connections/desk-tells-staff-browser.yaml',
    ]);
    const loaded = load([...around, ...found]);
    expect(loaded.problems).toEqual([]);
    const connection = (id: string) => loaded.model.connections.find((one) => one.id === id);
    expect(connection('staff-browser-asks-desk')?.via).toEqual(['proxy']);
    expect(loaded.model.systems.find((system) => system.id === 'card-provider')?.external).toBe(true);
    expect(loaded.model.stores.find((store) => store.id === 'drafts')?.in).toBe('desk');
    expect(connection('desk-keeps-drafts')?.access).toBe('read-write');
    expect(connection('desk-tells-staff-browser')?.opens).toBe('to');
    expect(connection('desk-tells-staff-browser')?.via).toEqual(['proxy', 'office-proxy']);
    const office = loaded.model.infrastructure.find((piece) => piece.id === 'office-proxy');
    expect(office?.in).toBe('archive');
    expect(office?.only).toBe('in the head office');
  });
});
