import { z } from 'zod';
import { KINDS } from './kinds.ts';
import { MarkerSchema, SHAPES } from './records.ts';

/**
 * The JSON Schema of each kind and of the marker, written from the `zod` shapes: a file name,
 * such as `apps.schema.json`, and its text. `npm run schema` writes them into `schema/`.
 */
export function schemas(): Record<string, string> {
  const files: Record<string, string> = {};
  const write = (name: string, shape: z.ZodType): void => {
    const schema = z.toJSONSchema(shape, { target: 'draft-7', io: 'input' });
    files[`${name}.schema.json`] = JSON.stringify(schema, null, 2) + '\n';
  };
  for (const { folder } of KINDS) write(folder, SHAPES[folder]);
  write('seefore', MarkerSchema);
  return files;
}
