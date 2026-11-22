import { z } from 'zod';
import { CURRENT_FORMAT, READABLE_VERSIONS } from './format.ts';
import { START, error } from './problem.ts';
import type { Problem } from './problem.ts';
import { checkShape } from './shape.ts';
import { NAME_MAX } from './text.ts';
import { keyPosition, peekTop, readYaml } from './yaml.ts';

/** The name of the file that makes a folder a source directory. */
export const MARKER_FILE = 'seefore.yaml';

/** The most characters the name of an architecture may have: the same as for any name. */
export { NAME_MAX };

export const MarkerSchema = z.strictObject({
  format: z.int().min(1),
  name: z
    .string()
    .max(NAME_MAX)
    .refine((name) => name.trim() !== '', { message: '`name` is empty.', params: { code: 'value-too-small' } })
    .refine((name) => !/[\r\n]/.test(name), { message: '`name` must be on one line.' }),
});

/** What the marker file says. */
export type Marker = z.infer<typeof MarkerSchema>;

export interface MarkerRead {
  /** Present when the marker is sound, also when its format is one this seefore cannot read. */
  marker?: Marker;
  problems: Problem[];
  /**
   * True when the marker says the directory is in a format this seefore reads. False when
   * the format is another one, and also when the marker cannot say which format it is. The
   * directory's records must then be left alone: there is no telling which rules they follow.
   */
  readable: boolean;
}

/** Reads the text of `seefore.yaml`. */
export function readMarker(text: string): MarkerRead {
  const yaml = readYaml(MARKER_FILE, text, 'The marker file');

  // The format comes first, before any rule of this format is applied. A directory in a
  // format this seefore does not know is refused whole, whatever else its marker holds.
  const format = peekTop(text, 'format');
  const known = typeof format === 'number' && Number.isInteger(format) && format >= 1;
  if (known && !READABLE_VERSIONS.includes(format)) {
    const reads = READABLE_VERSIONS.map((version) => `format ${version}`).join(' and ');
    const advice = format > CURRENT_FORMAT.version ? 'Install a newer seefore to read it.' : 'This seefore no longer reads it.';
    const where = yaml.map ? keyPosition(yaml, yaml.map, 'format') : START;
    const problem = error(
      MARKER_FILE,
      where,
      'format-not-readable',
      `This directory is written in format ${format}. This seefore reads ${reads}. ${advice}`,
    );
    const name = peekTop(text, 'name');
    return { ...(typeof name === 'string' ? { marker: { format, name } } : {}), problems: [problem], readable: false };
  }

  if (!yaml.doc || !yaml.map) return { problems: yaml.problems, readable: known };

  const { value, problems } = checkShape(MARKER_FILE, yaml, MarkerSchema, 'the marker file');
  if (!value) return { problems, readable: known };
  return { marker: value, problems: [], readable: true };
}
