import { isMap, isSeq, isScalar } from 'yaml';
import type { Document, YAMLMap } from 'yaml';
import { z } from 'zod';
import { capital, error, list, quote } from './problem.ts';
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
  const issues = [...result.error.issues];
  for (let index = 0; index < issues.length; index++) {
    const issue = issues[index] as z.core.$ZodIssue;
    const path: Path = issue.path;
    const first = problems.length;
    // A value of the wrong kind is one fault: its length or its size is not told as a second.
    const sameSpot = (other: z.core.$ZodIssue) => other !== issue && other.code === 'invalid_type' && other.path.length === path.length && other.path.every((part, at) => part === path[at]);
    if ((issue.code === 'too_big' || issue.code === 'too_small') && issues.some(sameSpot)) continue;
    // A value that may be a word or a mapping, and is a mapping: its own faults are told, at their places.
    if (issue.code === 'invalid_union' && isMap(nodeAt(doc, path))) {
      const inner = mappingIssues(schema, path, doc.toJS());
      if (inner.length > 0) {
        issues.push(...inner);
        continue;
      }
    }
    switch (issue.code) {
      case 'unrecognized_keys': {
        const parent = nodeAt(doc, path);
        const known = knownKeys(schema, path);
        for (const key of issue.keys) {
          const where = isMap(parent) ? keyPosition(yaml, parent, key) : yaml.at(parent);
          const hint = known.length > 0 ? ` Its keys are ${list(known)}.` : '';
          const owner = path.length === 0 ? what : label(path);
          const nothing = path.length === 0 && key === 'in' && (what === 'a system' || what === 'a person');
          // Inside `{ }` a comma starts a new key, so the rest of a sentence with a comma in it
          // reads as a key with no value.
          const pair = isMap(parent) ? parent.items.find((each) => isScalar(each.key) && each.key.value === key) : undefined;
          const cut = isMap(parent) && parent.flow === true && pair !== undefined && (pair.value === null || (isScalar(pair.value) && pair.value.value === null));
          const fix = nothing
            ? `${capital(what)} is in nothing. Say what it belongs to in its description.`
            : cut
              ? `A comma inside \`{ }\` starts a new key. If ${quote(key)} is the rest of a sentence, put that text in quotes, as in \`description: "First, then the rest"\`, or write the mapping on lines of its own.`
              : `Delete the key ${quote(key)} from the file, or, if a known key was meant, rename it.${hint}`;
          problems.push({ ...error(file, where, 'key-unknown', `${quote(key)} is not a key of ${owner}.${hint}`, fix), field: path.length === 0 ? key : String(path[0]) });
        }
        break;
      }
      case 'invalid_value':
      case 'invalid_type': {
        if (issue.code === 'invalid_value' && doc.hasIn(path)) {
          const allowed = issue.values.map((value) => String(value));
          problems.push(error(file, valuePosition(yaml, doc, path), 'value-not-allowed', notAllowed(path, allowed)));
        } else if (!doc.hasIn(path)) {
          const owner = path.length <= 1 ? what : label(path.slice(0, -1));
          const key = quote(String(path[path.length - 1]));
          const definition = definitionOf(schema, path);
          const fix = `Add the key ${key}.${definition ? ` ${definition}` : ''}`;
          problems.push(error(file, parentPosition(yaml, doc, path), 'key-missing', `${key} is missing from ${owner}.`, fix));
        } else if (issue.code === 'invalid_type') {
          const found = describe(doc.getIn(path));
          problems.push(
            error(
              file,
              valuePosition(yaml, doc, path),
              'value-wrong-kind',
              `${capital(label(path))} must be ${expected(issue.expected)}, but this is ${found}.`,
              written(path) ?? `Change the value of ${label(path)} to ${expected(issue.expected)}.`,
            ),
          );
        }
        break;
      }
      case 'too_small': {
        if (issue.origin === 'array') {
          const key = path[path.length - 1];
          const item = (typeof key === 'string' ? ITEMS[key] : undefined) ?? 'id';
          const fix = `Give ${label(path)} at least one ${item}${optional(schema, path) ? ', or delete the key' : ''}.`;
          problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-small', `${capital(label(path))} is an empty list.`, fix));
          break;
        }
        const message =
          issue.origin === 'string'
            ? Number(issue.minimum) <= 1
              ? `${capital(label(path))} is empty.`
              : `${capital(label(path))} is too short: it needs at least ${issue.minimum} characters.`
            : `${capital(label(path))} must be at least ${issue.minimum}.`;
        problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-small', message));
        break;
      }
      case 'too_big': {
        const value: unknown = doc.getIn(path);
        if (issue.origin === 'array') {
          problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-big', `${capital(label(path))} is too long a list: it may have at most ${issue.maximum}.`, `Take ids out of ${label(path)} until it has at most ${issue.maximum}.`));
          break;
        }
        const message =
          issue.origin === 'string' && typeof value === 'string'
            ? `${capital(label(path))} has ${characters(value)} characters. It may have at most ${issue.maximum}.`
            : `${capital(label(path))} must be at most ${issue.maximum}.`;
        problems.push(error(file, valuePosition(yaml, doc, path), 'value-too-big', message));
        break;
      }
      default: {
        // A schema that adds its own rule writes the whole message in plain words. An id twice in
        // a list is said here, where the whole path is known: "`a` is in `after` of the first step twice."
        const params = issue.code === 'custom' ? issue.params : undefined;
        const code = typeof params?.['code'] === 'string' ? params['code'] : 'value-invalid';
        const twice = params?.['twice'];
        const message = typeof twice === 'string' ? `${quote(twice)} is in ${label(path.slice(0, -1))} twice. Keep one.` : issue.message;
        problems.push(error(file, valuePosition(yaml, doc, path), code, message));
      }
    }
    // The field at fault is the first key of the path; a key that is not known names itself.
    if (path.length > 0) for (const problem of problems.slice(first)) problem.field ??= String(path[0]);
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

/**
 * How to write a step, a field or their list, for a writer who gave it another form: a step as
 * a bare id, or `fields` as a mapping of names. Nothing for any other path.
 */
function written(path: Path): string | undefined {
  const [top, index] = path;
  if (path.length > 2 || (path.length === 2 && typeof index !== 'number')) return undefined;
  if (top === 'steps') return 'Write each step as a mapping with an `id` of its own and what it is on, as in `- {id: places, does: customer-places-order}`.';
  if (top === 'fields') return 'Write each field as a mapping with a `name` and, if wanted, a `description`, as in `- {name: balance, description: What is owed}`.';
  return undefined;
}

/** The words for the first ten places in a list. */
const ORDINALS = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];

/** The lists whose items are mappings, and what one item is called. */
const ITEMS: Record<string, string> = { steps: 'step', fields: 'field', context: 'line of `context`' };

/** An item of a list in words: "the third step", or "step 12" past the tenth. */
function nth(index: number, item: string): string {
  const ordinal = ORDINALS[index];
  return ordinal === undefined ? `${item} ${index + 1}` : `the ${ordinal} ${item}`;
}

/**
 * How a path is shown in a message: `name`, or "the second id in `technology`" for an item of a
 * list. Past the tenth an item is named by its number, as in "id 11 in `technology`". Inside a
 * step or a field, the value is named as people say it: "`does` of the third step", "the second
 * id in `after` of the first step". It starts in lowercase; `capital` makes it start a sentence.
 */
export function label(path: Path): string {
  const at = path.findIndex((part, index) => typeof part === 'string' && ITEMS[part] !== undefined && typeof path[index + 1] === 'number');
  if (at >= 0) {
    const item = nth(path[at + 1] as number, ITEMS[path[at] as string] as string);
    const rest = path.slice(at + 2);
    return rest.length === 0 ? item : `${label(rest)} of ${item}`;
  }
  const last = path[path.length - 1];
  if (typeof last !== 'number') return quote(dotted(path));
  const list = quote(dotted(path.slice(0, -1)));
  return `${nth(last, 'id')} in ${list}`;
}

/** A path as a program writes it, and as the rules name a field: `owner.team`, `via[2]`, `steps[2].does`. */
export function dotted(path: Path): string {
  let text = '';
  for (const part of path) {
    if (typeof part === 'number') text += `[${part}]`;
    else text += (text === '' ? '' : '.') + String(part);
  }
  return text;
}

/** That the value at a path is not one of the few it may be, and which those are. */
export function notAllowed(path: Path, allowed: readonly string[]): string {
  return `${capital(label(path))} must be one of ${list(allowed)}.`;
}

/** How many characters a text has, counted as the limits on text count them: one for each code point. */
function characters(text: string): number {
  return [...text].length;
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

type Def = { type?: string; innerType?: unknown; element?: unknown };

function defOf(schema: unknown): Def | undefined {
  return (schema as { _zod?: { def?: Def } } | undefined)?._zod?.def;
}

/** A schema without the `optional` around it. */
function unwrapped(schema: unknown): unknown {
  let current = schema;
  while (defOf(current)?.type === 'optional') current = defOf(current)?.innerType;
  return current;
}

/**
 * The faults inside a mapping that stands where a word may stand too, as `via` of a selector:
 * the mapping is held against its own shape, at its place in the file, so that each message
 * names the whole path. None when the shape there is not known.
 */
function mappingIssues(schema: z.ZodType, path: Path, value: unknown): z.core.$ZodIssue[] {
  const mapping = mappingOf(schemaAt(schema, path));
  if (mapping === undefined || path.some((part) => typeof part !== 'string')) return [];
  let wrapped = mapping as z.ZodType;
  for (const part of [...path].reverse()) wrapped = z.object({ [part as string]: wrapped });
  const result = wrapped.safeParse(value);
  return result.success ? [] : result.error.issues;
}

/** The mapping a schema stands for: itself, or the one form of a union that is a mapping. */
function mappingOf(schema: unknown): unknown {
  const plain = unwrapped(schema);
  const def = defOf(plain) as (Def & { options?: unknown[] }) | undefined;
  if (def?.type === 'union') return def.options?.find((option) => shapeOf(unwrapped(option)) !== undefined);
  return shapeOf(plain) !== undefined ? plain : undefined;
}

/** The schema of the value at a path, into mappings and lists, with the `optional` around it kept. */
function schemaAt(schema: z.ZodType, path: Path): unknown {
  let current: unknown = schema;
  for (const part of path) {
    current = unwrapped(current);
    if (typeof part === 'string' && defOf(current)?.type === 'union') current = mappingOf(current);
    if (typeof part === 'number') {
      const def = defOf(current);
      if (def?.type !== 'array') return undefined;
      current = def.element;
      continue;
    }
    const shape = shapeOf(current);
    if (!shape || typeof part !== 'string' || !(part in shape)) return undefined;
    current = shape[part];
  }
  return current;
}

/** The keys a mapping may have, when the schema at that path is a plain object. */
function knownKeys(schema: z.ZodType, path: Path): string[] {
  const shape = shapeOf(mappingOf(schemaAt(schema, path)));
  return shape ? Object.keys(shape) : [];
}

/** The definition, in words, that the schema gives the key at a path; none when it gives none. */
function definitionOf(schema: z.ZodType, path: Path): string | undefined {
  const description = (schemaAt(schema, path) as { description?: unknown } | undefined)?.description;
  return typeof description === 'string' && description !== '' ? description : undefined;
}

/** True when the key at a path may be left out. */
function optional(schema: z.ZodType, path: Path): boolean {
  return defOf(schemaAt(schema, path))?.type === 'optional';
}

function shapeOf(schema: unknown): Record<string, unknown> | undefined {
  if (typeof schema !== 'object' || schema === null || !('shape' in schema)) return undefined;
  const shape = (schema as { shape: unknown }).shape;
  return typeof shape === 'object' && shape !== null ? (shape as Record<string, unknown>) : undefined;
}

export type { YAMLMap };
