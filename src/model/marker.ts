import type { Problem } from './answer.ts';
import { START, error } from './problem.ts';
import { MarkerSchema } from './records.ts';
import { checkShape } from './shape.ts';
import { keyPosition, peekTop, readYaml } from './yaml.ts';

/** The name of the file that makes a folder a model. */
export const MARKER_FILE = 'seefore.yaml';

export type MarkerRead = {
  /** The model's name, when the marker has a good one. */
  name?: string;
  problems: Problem[];
  /** True when the marker says, once, that the format is 1: only then are the records read. */
  readable: boolean;
};

/** Reads the text of the marker. A format that is not 1 stops the reading of the records. */
export function readMarker(text: string): MarkerRead {
  const yaml = readYaml(MARKER_FILE, text, 'The marker file', { notesIn: null });

  // The format comes first: with another one there is no telling which rules the records follow.
  const format = peekTop(text, 'format');
  const known = typeof format === 'number' && Number.isInteger(format) && format >= 1;
  if (known && format !== 1) {
    const where = yaml.map ? keyPosition(yaml, yaml.map, 'format') : START;
    const advice = format > 1 ? 'Install a newer seefore to read it.' : 'This seefore does not read it.';
    return {
      problems: [error(MARKER_FILE, where, 'format-not-readable', `This folder is written in format ${format}. This seefore reads format 1. ${advice}`)],
      readable: false,
    };
  }
  if (!yaml.doc || !yaml.map) return { problems: yaml.problems, readable: false };

  const { value, problems } = checkShape(MARKER_FILE, yaml, MarkerSchema, 'the marker file');
  return { ...(value ? { name: value.name } : {}), problems, readable: format === 1 };
}
