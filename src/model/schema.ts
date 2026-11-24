import { z } from 'zod';
import { KINDS } from './kinds.ts';
import { ChangeSchema, MarkerSchema, SHAPES } from './records.ts';

/**
 * The JSON Schema of each kind, of the marker and of the input of a change, written from the
 * `zod` shapes: a file name, such as `apps.schema.json`, and its text. `npm run schema` writes
 * them into `schema/`.
 */
export function schemas(): Record<string, string> {
  const files: Record<string, string> = {};
  const write = (name: string, shape: z.ZodType): void => {
    const schema = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
    files[`${name}.schema.json`] = JSON.stringify(schema, null, 2) + '\n';
  };
  for (const { folder } of KINDS) write(folder, SHAPES[folder]);
  write('seefore', MarkerSchema);
  // The input of a change has a shape and no folder yet: where a change's file lies comes later.
  write('changes', ChangeSchema);
  return files;
}
