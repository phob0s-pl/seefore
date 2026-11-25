import { z } from 'zod';
import { ID, ID_MAX } from './id.ts';
import { CHANGED_FOLDERS, KINDS } from './kinds.ts';
import { MarkerSchema, SHAPES } from './records.ts';
import { knownKeys } from './shape.ts';

/** A key of `add`, `update` or an item of `remove`: the path of a record of a folder, as `apps/ledger`. */
const pathOf = (folder: string): string => `^${folder}/${ID.source.slice(1, -1)}$`;

/**
 * The body of a change in JSON Schema. Under `add` a record is held by the schema of its
 * folder, which lies beside this one. Under `update` the keys are those of its kind and their
 * values are free: the check holds them on the record as it would be.
 */
function withBody(schema: { properties: Record<string, Record<string, unknown>> }): void {
  const add: Record<string, unknown> = {};
  const update: Record<string, unknown> = {};
  for (const folder of CHANGED_FOLDERS) {
    add[pathOf(folder)] = { $ref: `${folder}.schema.json` };
    update[pathOf(folder)] = { type: 'object', minProperties: 1, propertyNames: { enum: knownKeys(SHAPES[folder as keyof typeof SHAPES], []) } };
  }
  const { add: adds, update: updates, remove } = schema.properties;
  schema.properties.add = { description: adds?.description, type: 'object', minProperties: 1, patternProperties: add, additionalProperties: false };
  schema.properties.update = { description: updates?.description, type: 'object', minProperties: 1, patternProperties: update, additionalProperties: false };
  schema.properties.remove = { ...remove, uniqueItems: true, items: { type: 'string', pattern: `^(?:${CHANGED_FOLDERS.join('|')})/${ID.source.slice(1, -1)}$` } };
}

/**
 * The JSON Schema of each kind and of the marker, written from the `zod` shapes: a file name,
 * such as `apps.schema.json`, and its text. `npm run schema` writes them into `schema/`.
 */
export function schemas(): Record<string, string> {
  const files: Record<string, string> = {};
  const write = (name: string, shape: z.ZodType): void => {
    const schema = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
    if (name === 'changes') withBody(schema as never);
    // A point's id is the key it stands under.
    if (name === 'reviews') (schema as unknown as { properties: { points: Record<string, unknown> } }).properties.points.propertyNames = { pattern: ID.source, maxLength: ID_MAX };
    files[`${name}.schema.json`] = JSON.stringify(schema, null, 2) + '\n';
  };
  for (const { folder } of KINDS) write(folder, SHAPES[folder]);
  write('seefore', MarkerSchema);
  return files;
}
