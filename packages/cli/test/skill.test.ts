import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { APP_KINDS, CURRENT_FORMAT, STORE_KINDS, load } from '@seefore/core';
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

describe('the model skill', () => {
  it('carries the conventions of the spec word for word', () => {
    for (const name of ['conventions', 'cannot-say-yet']) {
      expect(block(skill, name), `the block ${name}; run \`npm run sync:skill\``).toBe(block(spec, name));
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

  it('names the kinds the engine allows, in order', () => {
    const line = skill.split('\n- ').find((item) => item.startsWith('`kind` of an app')) ?? '';
    const [ofApp, ofStore] = line.split('`kind` of a store');
    expect(inBackticks(ofApp ?? '').filter((word) => word !== 'kind')).toEqual([...APP_KINDS]);
    expect(inBackticks(ofStore ?? '').slice(0, STORE_KINDS.length)).toEqual([...STORE_KINDS]);
  });
});

describe('the spec of stage 4', () => {
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
    expect(loaded.model.apps[0]?.description).toBe('Takes orders and says how far each has got. Only in the hosted edition: see issue #5377.');
  });
});
