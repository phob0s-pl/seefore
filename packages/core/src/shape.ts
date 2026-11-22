import { isMap, isSeq } from 'yaml';
import type { Document, YAMLMap } from 'yaml';
import type { z } from 'zod';
import { error, list, quote } from './problem.ts';
import type { Position, Problem } from './problem.ts';
import { keyPosition } from './yaml.ts';
import type { YamlFile } from './yaml.ts';

/** The outcome of holding a file against the shape it should have. */
export interface Checked<T> {
  /** The file's content, typed. Present only when nothing is wrong. */
  value?: T;
  problems: Problem[];
}

type Path = readonly PropertyKey[];

/**
 * Holds a sound YAML file against a schema and turns every mismatch into a problem with its
 * place in the file and a message in plain words.
 *
 * `what` names the kind of file for messages, as in "the marker file".
 */
export function checkShape<T>(file: string, yaml: YamlFile, schema: z.ZodType<T>, what: string): Checked<T> {
  const { doc, map } = yaml;
  if (!doc || !map) return { problems: [] };

  const result = schema.safeParse(doc.toJS());
  if (result.success) return { value: result.data, problems: [] };

  const problems: Problem[] = [];
  for (const issue of result.error.issues) {
    const path: Path = issue.path;
    switch (issue.code) {
      case 'unrecognized_keys': {
        const parent = nodeAt(doc, path);
        const known = knownKeys(schema, path);
        for (const key of issue.keys) {
          const where = isMap(parent) ? keyPosition(yaml, parent, key) : yaml.at(parent);
          const hint = known.length > 0 ? ` Its keys are ${list(known)}.` : '';
          const owner = path.length === 0 ? what : label(path);
          problems.push(error(file, where, 'key-unknown', `${quote(key)} is not a key of ${owner}.${hint}`));
        }
        break;
      }
      case 'invalid_type': {
        if (!doc.hasIn(path)) {
          const owner = path.length <= 1 ? what : label(path.slice(0, -1));
          problems.push(error(file, parentPosition(yaml, doc, path), 'key-missing', `${label(path)} is missing from ${owner}.`));
        } else {
          const found = describe(doc.getIn(path));
          problems.push(
            error(file, valuePosition(yaml, doc, path), 'value-wrong-kind', `${label(path)} must be ${expected(issue.expected)}, but this is ${found}.`),
          );
        }
        break;
      }
      case 'too_small': {
        const message =
          issue.origin === 'string'
            ? Number(issue.minimum) <= 1
              ? `${label(path)} is empty.`
              : `${label(path)} is too short: it needs at least ${issue.minimum} characters.`
            : `${label(path)} must be at least ${issue.minimum}.`;
        problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-small', message));
        break;
      }
      case 'too_big': {
        const message =
          issue.origin === 'string'
            ? `${label(path)} is too long: it has at most ${issue.maximum} characters.`
            : `${label(path)} must be at most ${issue.maximum}.`;
        problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-big', message));
        break;
      }
      case 'invalid_value': {
        const allowed = issue.values.map((value) => String(value));
        problems.push(error(file, valuePosition(yaml, doc, path), 'value-not-allowed', `${label(path)} must be one of ${list(allowed)}.`));
        break;
      }
      default: {
        // A schema that adds its own rule writes the whole message in plain words.
        const code = issue.code === 'custom' && typeof issue.params?.['code'] === 'string' ? issue.params['code'] : 'value-invalid';
        problems.push(error(file, valuePosition(yaml, doc, path), code, issue.message));
      }
    }
  }
  return { problems };
}

function nodeAt(doc: Document, path: Path): unknown {
  return path.length === 0 ? doc.contents : doc.getIn(path, true);
}

/** The place of the value at a path, or of the nearest thing above it that exists. */
function valuePosition(yaml: YamlFile, doc: Document, path: Path): Position {
  for (let length = path.length; length >= 0; length--) {
    const node = nodeAt(doc, path.slice(0, length));
    if (node !== undefined && node !== null) return yaml.at(node);
  }
  return yaml.at(undefined);
}

/** The place of the mapping a missing key should be in. */
function parentPosition(yaml: YamlFile, doc: Document, path: Path): Position {
  return valuePosition(yaml, doc, path.slice(0, -1));
}

/** How a path is shown in a message: `name`, `owner.team`, `tags[2]`. */
export function label(path: Path): string {
  let text = '';
  for (const part of path) {
    if (typeof part === 'number') text += `[${part}]`;
    else text += (text === '' ? '' : '.') + String(part);
  }
  return quote(text);
}

function expected(kind: string): string {
  switch (kind) {
    case 'string':
      return 'text';
    case 'int':
      return 'a whole number';
    case 'number':
      return 'a number';
    case 'boolean':
      return '`true` or `false`';
    case 'array':
      return 'a list';
    case 'object':
    case 'record':
      return 'a mapping';
    default:
      return kind;
  }
}

function describe(value: unknown): string {
  if (value === null || value === undefined) return 'empty';
  if (typeof value === 'string') return 'text';
  if (typeof value === 'number') return Number.isInteger(value) ? 'a whole number' : 'a number that is not whole';
  if (typeof value === 'boolean') return '`true` or `false`';
  // A list comes out of the document as a node of its own, not as an array.
  if (Array.isArray(value) || isSeq(value)) return 'a list';
  return 'a mapping';
}

/** The keys a mapping may have, when the schema at that path is a plain object. */
function knownKeys(schema: z.ZodType, path: Path): string[] {
  let current: unknown = schema;
  for (const part of path) {
    const shape = shapeOf(current);
    if (!shape || typeof part !== 'string' || !(part in shape)) return [];
    current = shape[part];
  }
  const shape = shapeOf(current);
  return shape ? Object.keys(shape) : [];
}

function shapeOf(schema: unknown): Record<string, unknown> | undefined {
  if (typeof schema !== 'object' || schema === null || !('shape' in schema)) return undefined;
  const shape = (schema as { shape: unknown }).shape;
  return typeof shape === 'object' && shape !== null ? (shape as Record<string, unknown>) : undefined;
}

export type { YAMLMap };
