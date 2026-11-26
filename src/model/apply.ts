import { isMap, isNode, isScalar, isSeq, stringify } from 'yaml';
import type { Pair, YAMLMap, YAMLSeq } from 'yaml';
import type { z } from 'zod';
import type { ModelRead, Problem } from './answer.ts';
import { readModel } from './read.ts';
import type { SourceFile } from './read.ts';
import { stepsAfter } from './change.ts';
import { changesOf } from './changes.ts';
import { canonical, changeMark } from './mark.ts';
import { list, quote } from './problem.ts';
import { SHAPES } from './records.ts';
import type { Review } from './review.ts';
import { nearest } from './rules.ts';
import { knownKeys } from './shape.ts';
import { parseText } from './yaml.ts';

/**
 * `seefore apply`: one change laid onto the texts of a model's files, and marked applied. A file
 * is laid out by hand, and a person reads what was done as a diff, so lines are moved and a file
 * is never written anew from its parsed form: a record the change adds is its lines in the change,
 * moved left; a key it updates is its lines in the change, in place of the key's lines in the
 * file; every other line stays as it was. What is written is read back, and must be the record
 * the check laid for the change; a file whose lines cannot be moved, or that reads back otherwise,
 * is written by the library from that record. Pure: files in, files out.
 */

/** What applying a change comes to: what to write and what it says, with the model as it is afterwards. */
export type Applied = {
  /** One line a record, in the change's order: `+` added, `~` updated with the keys the change writes, `-` removed. */
  lines: string[];
  added: number;
  updated: number;
  removed: number;
  /** The warnings of the check at the change. They refuse nothing. */
  warnings: Problem[];
  /** What else it says, a line each: the review, and whether it read the change as it is; the errors the model has of its own; and each other change the check now faults. */
  said: string[];
  /** The files of the records added and rewritten, in the change's order. */
  written: SourceFile[];
  /** The files taken away, in the change's order. */
  gone: string[];
  /** The change's own file, with `status: applied` as its last line. */
  change: SourceFile;
  /** The files written whole by the library, since their lines could not be moved or read back otherwise: those of records, and the change's own when it is one. */
  whole: string[];
  /** The model as it is afterwards. */
  after: ModelRead;
};

/** Why nothing is applied: a line a reason, and the errors of the check at the change, as the check tells them. */
export type ApplyRefused = { refusals: string[]; faults: Problem[] };

/** The lines of one pair of a block mapping, or of one item of a block list: from the start of its first line to the end of its last that is not blank. `column` is where its key or its hyphen stands. */
type Lines = { start: number; end: number; column: number };
type PairLines = Lines & { key: string; pair: Pair<unknown, unknown> };
type ItemLines = Lines & { node: unknown };

/** Gives up on moving the lines of one file, which the library then writes. */
function cannot(why: string): never {
  throw new Error(`The lines cannot be moved: ${why}.`);
}

/** What `make` gives, or nothing when it gives up. */
function attempt<T>(make: () => T): T | undefined {
  try {
    return make();
  } catch {
    return undefined;
  }
}

/** The start of the line that holds an offset. */
const lineStart = (text: string, offset: number): number => text.lastIndexOf('\n', offset - 1) + 1;

/** A text that ends with a line break, as every line moved does. */
const ended = (text: string): string => (text === '' || text.endsWith('\n') ? text : `${text}\n`);

/** Where the lines from `start` to `end` stop, with the blank lines at their end left out. */
function filled(text: string, start: number, end: number): number {
  let at = end;
  while (at > start) {
    const from = Math.max(start, lineStart(text, at - 1));
    if (text.slice(from, at).trim() !== '') break;
    at = from;
  }
  return at;
}

/** The lines of each pair of a block mapping, the last to `end`. A mapping in braces, or a key after something else on its line, cannot be moved. */
function pairLines(text: string, map: YAMLMap<unknown, unknown>, end: number): PairLines[] {
  if (map.flow === true) cannot('a mapping in braces');
  const starts = map.items.map((pair) => {
    const at = isScalar(pair.key) ? pair.key.range?.[0] : undefined;
    if (at === undefined) cannot('a key with no place');
    const start = lineStart(text, at);
    if (text.slice(start, at).trim() !== '') cannot('a key after something else on its line');
    return { start, column: at - start };
  });
  return map.items.map((pair, index) => {
    const { start, column } = starts[index] as { start: number; column: number };
    return { key: String((pair.key as { value: unknown }).value), pair, start, column, end: filled(text, start, starts[index + 1]?.start ?? end) };
  });
}

/** The lines of each item of a block list, the last to `end`. A list in brackets, or an item whose line does not start with its hyphen, cannot be moved. */
function itemLines(text: string, seq: YAMLSeq<unknown>, end: number): ItemLines[] {
  if (seq.flow === true) cannot('a list in brackets');
  const starts = seq.items.map((node) => {
    const at = isNode(node) ? node.range?.[0] : undefined;
    if (at === undefined) cannot('an item with no place');
    const start = lineStart(text, at);
    const column = text.slice(start, at).search(/\S/);
    if (column < 0 || text.charAt(start + column) !== '-') cannot('an item whose line does not start with its hyphen');
    return { start, column };
  });
  return seq.items.map((node, index) => {
    const { start, column } = starts[index] as { start: number; column: number };
    return { node, start, column, end: filled(text, start, starts[index + 1]?.start ?? end) };
  });
}

/** Lines moved right or left by `by` columns. A blank line loses what spaces it can; a line that is not blank, with too few spaces to move left, cannot be moved. */
function shift(lines: string, by: number): string {
  return lines
    .split('\n')
    .map((line) => {
      if (by >= 0) return line.trim() === '' ? line : ' '.repeat(by) + line;
      if (line.trim() === '') return line.replace(new RegExp(`^ {0,${-by}}`), '');
      if (!line.startsWith(' '.repeat(-by))) cannot('a line with too few spaces to move left');
      return line.slice(-by);
    })
    .join('\n');
}

/** Whether two values are one, whatever the order of their keys. */
const same = (a: unknown, b: unknown): boolean => canonical(a) === canonical(b);

/** The file of a record that the change adds: the record's lines in the change, moved left to the first column. Folded text stays as it is folded. */
function addedText(text: string, record: PairLines): string {
  const map = record.pair.value;
  if (!isMap(map)) cannot('a record that is no mapping');
  const [first] = pairLines(text, map, record.end);
  if (first === undefined) cannot('a record with no key');
  return ended(shift(text.slice(first.start, record.end), -first.column));
}

/**
 * `steps` of a flow as the change writes them, step by step: a bare id is that step's own lines in
 * the file, as they are; a step written whole is its lines in the change, at the column of the
 * file's own steps. A step left out is gone.
 */
function stepsText(file: string, there: PairLines | undefined, text: string, key: PairLines): string {
  const old = there !== undefined && isSeq(there.pair.value) && there.pair.value.flow !== true ? itemLines(file, there.pair.value, there.end) : [];
  const column = old[0]?.column ?? 2;
  const steps = itemLines(text, key.pair.value as YAMLSeq<unknown>, key.end).map((item) => {
    const { node } = item;
    if (!isScalar(node)) return ended(shift(text.slice(item.start, item.end), column - item.column));
    const kept = old.find((step) => isMap(step.node) && step.node.get('id') === node.value);
    if (kept === undefined) cannot('a bare id that names no step of the file');
    return ended(file.slice(kept.start, kept.end));
  });
  return `steps:\n${steps.join('')}`;
}

/**
 * A record's file with what the change updates in it. Each key's lines in the file, from its line
 * to the next key's, give way to the key's lines in the change, moved left; a key the file lacks
 * goes in after the nearest key before it in the order of the folder's shape, or first when the
 * file has none of those; `null` takes the key's lines out; a key whose value is what the file says
 * already is left as the file has it. Every other line stays as it was.
 */
function updatedText(file: string, folder: string, text: string, record: PairLines, wanted: Record<string, unknown>): string {
  if (file.includes('\r')) cannot('a file with carriage returns');
  const map = record.pair.value;
  if (!isMap(map)) cannot('a record that is no mapping');
  const order = knownKeys(SHAPES[folder as keyof typeof SHAPES] as z.ZodType, []);
  // A file that ends with no line break gets one: its last line is then a line as any other.
  let out = ended(file);
  for (const key of pairLines(text, map, record.end)) {
    const doc = parseText(out);
    if (doc.errors.length > 0 || !isMap(doc.contents)) cannot('a file that does not read');
    const live = pairLines(out, doc.contents, out.length);
    if (live.some((each) => each.column !== 0)) cannot('a file whose keys do not start their lines');
    const now = doc.toJS() as Record<string, unknown>;
    const there = live.find((each) => each.key === key.key);
    const value = wanted[key.key];
    if (value === null || value === undefined) {
      if (there !== undefined) out = out.slice(0, there.start) + out.slice(there.end);
      continue;
    }
    const steps = folder === 'flows' && key.key === 'steps';
    if (there !== undefined && same(steps && Array.isArray(value) ? stepsAfter(now.steps, value) : value, now[key.key])) continue;
    // A list of steps with a bare id in it is written step by step; a list in brackets has no lines of its own steps to keep.
    const node = key.pair.value;
    const stepwise = steps && isSeq(node) && (node.flow !== true || node.items.some((item) => isScalar(item)));
    const fresh = stepwise ? stepsText(out, there, text, key) : ended(shift(text.slice(key.start, key.end), -key.column));
    if (there !== undefined) {
      out = out.slice(0, there.start) + fresh + out.slice(there.end);
      continue;
    }
    const place = order.indexOf(key.key);
    if (place < 0) cannot('a key that the shape does not have');
    const before = order.slice(0, place).reverse().find((name) => live.some((each) => each.key === name));
    const at = before === undefined ? (live[0]?.start ?? 0) : (live.find((each) => each.key === before) as PairLines).end;
    out = out.slice(0, at) + fresh + out.slice(at);
  }
  return out;
}

/** The change's file with one new last line, `status: applied`, after a line break when the file ends with none. */
function withStatus(text: string): string {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  return `${text}${/[\r\n]$/.test(text) ? '' : eol}status: applied${eol}`;
}

/** A record as the library writes it, where its lines cannot be moved. */
const byLibrary = (fields: unknown): string => stringify(fields, { lineWidth: 0, aliasDuplicateObjects: false });

/** How many of a thing, as `1 error` and `2 errors`. */
const many = (n: number, one: string): string => `${n} ${one}${n === 1 ? '' : 's'}`;

/**
 * The review of a change in one line: none, nothing open, or what waits. A block waits while it is
 * open, and for the person while it is declined or reopened; a point of either severity waits while
 * it is fixed, since its correction is read again. A note that is open, declined or reopened waits
 * for nobody. The word "block" goes with the first count of blocks alone: the count of what is fixed
 * may hold notes, so it has none.
 */
function reviewLine(review: Review | undefined): string {
  if (review === undefined) return 'Review: none.';
  const count = (...statuses: string[]) => review.points.filter((point) => point.severity === 'block' && statuses.includes(point.status)).length;
  const person = count('declined', 'reopened');
  const waits = [
    { n: count('open'), what: 'open', blocks: true },
    { n: review.points.filter((point) => point.status === 'fixed').length, what: 'fixed and not read again', blocks: false },
    { n: person, what: person === 1 ? 'waits for the person' : 'wait for the person', blocks: true },
  ].filter((each) => each.n > 0);
  if (waits.length === 0) return 'Review: nothing open.';
  const named = waits.find((each) => each.blocks);
  return `Review: ${waits.map((each) => `${each.n}${each === named ? (each.n === 1 ? ' block' : ' blocks') : ''} ${each.what}`).join(', ')}.`;
}

/**
 * Applies one change to a model's files: the records it adds and updates written, those it removes
 * taken away, and `status: applied` written into its own file. `asked` is the change's id, the name
 * of its file in `changes/`. Gives what to write and what to say, with the model as it is
 * afterwards; or the refusals, and then nothing is applied. A change is refused when it is not
 * there, is decided, has no body, or has an error of the check at its file.
 */
export function applyChange(files: readonly SourceFile[], asked: string): Applied | ApplyRefused {
  const id = asked.replace(/^changes\//, '').replace(/\.yaml$/, '');
  const path = `changes/${id}.yaml`;
  const named = quote(`changes/${id}`);
  const refuse = (refusal: string, faults: Problem[] = []): ApplyRefused => ({ refusals: [refusal], faults });
  const own = files.find((file) => file.path === path);
  if (own === undefined) {
    const ids = files.flatMap((file) => /^changes\/([^/]+)\.yaml$/.exec(file.path)?.[1] ?? []).sort();
    const close = nearest(id, ids);
    const which = close !== undefined ? ` The nearest is ${quote(close)}.` : ids.length > 0 ? ` The changes are ${list(ids)}.` : ' There are no changes.';
    return refuse(`There is no change ${quote(id)}.${which}`);
  }

  // ---- what the check says of the change, before anything is moved
  const before = readModel(files);
  const record = before.records.find((each) => each.kind === 'changes' && each.id === id);
  if (record?.fields.status === 'applied') return refuse(`${named} is applied already.`);
  if (record?.fields.status === 'rejected') return refuse(`${named} is rejected. To open it again, take \`status\` and \`why\` out of its file.`);
  const faults = before.problems.filter((problem) => problem.file === path && problem.severity === 'error');
  if (faults.length > 0) return refuse(`The check faults ${named}:`, faults);
  const laid = before.laid.find((each) => each.change === id);
  if (record === undefined || laid === undefined) return refuse(`The check did not read ${named}: \`seefore check\` says why.`);
  if (record.fields.add === undefined && record.fields.update === undefined && record.fields.remove === undefined) return refuse(`${named} has no \`add\`, \`update\` or \`remove\`: there is nothing to apply.`);

  // ---- each record in the change's order, its lines moved; nothing where they cannot be
  const doc = parseText(own.text);
  const top = doc.contents as YAMLMap<unknown, unknown>;
  const body = doc.toJS() as { update?: Record<string, Record<string, unknown>>; remove?: string[] };
  const sections = own.text.includes('\r') ? undefined : attempt(() => pairLines(own.text, top, own.text.length));
  const lines: string[] = [];
  const moved = new Map<string, string | undefined>();
  const gone: string[] = [];
  const counts = { added: 0, updated: 0, removed: 0 };
  for (const section of top.items) {
    const verb = isScalar(section.key) ? section.key.value : undefined;
    if (verb === 'remove') {
      for (const each of body.remove ?? []) {
        gone.push(`${each}.yaml`);
        lines.push(`- ${each}`);
        counts.removed++;
      }
      continue;
    }
    const records = section.value;
    if ((verb !== 'add' && verb !== 'update') || !isMap(records)) continue;
    const region = sections?.find((each) => each.pair === section);
    const regions = region === undefined ? undefined : attempt(() => pairLines(own.text, records, region.end));
    for (const pair of records.items) {
      const at = regions?.find((each) => each.pair === pair);
      const each = isScalar(pair.key) ? String(pair.key.value) : '';
      const file = `${each}.yaml`;
      if (verb === 'add') {
        lines.push(`+ ${each}`);
        counts.added++;
        moved.set(file, at === undefined ? undefined : attempt(() => addedText(own.text, at)));
        continue;
      }
      const wanted = body.update?.[each] ?? {};
      lines.push(`~ ${each}: ${Object.keys(wanted).join(', ')}`);
      counts.updated++;
      const was = files.find((source) => source.path === file)?.text;
      moved.set(file, at === undefined || was === undefined ? undefined : attempt(() => updatedText(was, each.slice(0, each.indexOf('/')), own.text, at, wanted)));
    }
  }

  // ---- what is written is what was judged: each file read back, and written by the library where it reads otherwise
  const expected = new Map(laid.records.map((each) => [each.file, each.fields as unknown]));
  const texts = new Map<string, string>();
  const whole = new Set<string>();
  const wholly = (file: string): void => {
    texts.set(file, byLibrary(expected.get(file)));
    whole.add(file);
  };
  for (const [file, text] of moved) {
    if (!expected.has(file)) return refuse(`${quote(file)} cannot be written as the check read it.`);
    if (text === undefined) wholly(file);
    else texts.set(file, text);
  }
  expected.set(path, { ...record.fields, status: 'applied' });
  texts.set(path, withStatus(own.text));
  const leave = new Set(gone);
  const filesAfter = (): SourceFile[] => [...files.filter((file) => !texts.has(file.path) && !leave.has(file.path)), ...[...texts].map(([file, text]) => ({ path: file, text }))];
  const misread = (model: ModelRead): string[] => [
    ...[...expected].filter(([file, fields]) => !same(model.records.find((each) => each.file === file)?.fields, fields)).map(([file]) => file),
    ...gone.filter((file) => model.records.some((each) => each.file === file)),
  ];
  let after = readModel(filesAfter());
  const wrong = misread(after);
  if (wrong.length > 0) {
    for (const file of wrong) if (expected.has(file)) wholly(file);
    after = readModel(filesAfter());
    const still = misread(after);
    if (still.length > 0) return { refusals: still.map((file) => `${quote(file)} cannot be written as the check read it.`), faults: [] };
  }

  // ---- what it says, and applies all the same
  const warnings = before.problems.filter((problem) => problem.file === path && problem.severity === 'warning');
  const review = changesOf(before.records, before.laid).review(id);
  const said = [reviewLine(review)];
  // A review that read the change before it moved does not answer for the change as it is.
  const mark = changeMark(record.fields);
  if (review?.read !== undefined && review.read !== mark) said.push(`The review read the change as ${quote(review.read)}; it is ${quote(mark)} now.`);
  const ownErrors = before.problems.filter((problem) => problem.severity === 'error' && !problem.file.startsWith('changes/') && !problem.file.startsWith('reviews/')).length;
  if (ownErrors > 0) {
    said.push(`The model has ${many(ownErrors, 'error')} of its own: \`seefore check\` lists ${ownErrors === 1 ? 'it' : 'them'}.`);
    // A count is left uncounted, and a rule unjudged, only where a file outside `rules/` and `context/` does not read: as the check read the model with this change.
    if (after.rulings.length > 0 && after.counts.some((count) => count.checked === null)) said.push('With them, no rule of `rules/` was judged with this change.');
  }
  // A file that was there and that the library wrote is a larger diff than the change: say which, so that nobody takes it for a fault.
  const was = new Set(files.map((file) => file.path));
  for (const file of [...moved.keys(), path]) if (whole.has(file) && was.has(file)) said.push(`${quote(file)} is written anew, since its lines could not be moved: its layout is the library's.`);
  const errorsAt = (model: ModelRead, file: string): number => model.problems.filter((problem) => problem.file === file && problem.severity === 'error').length;
  for (const other of after.records) {
    if (other.kind !== 'changes' || other.file === path || other.fields.status !== undefined || errorsAt(before, other.file) > 0) continue;
    const now = errorsAt(after, other.file);
    if (now > 0) said.push(`The check now faults ${quote(`changes/${other.id}`)}: ${many(now, 'error')}.`);
  }

  return {
    lines,
    ...counts,
    warnings,
    said,
    written: [...moved.keys()].flatMap((file) => {
      const text = texts.get(file) as string;
      return text === files.find((source) => source.path === file)?.text ? [] : [{ path: file, text }];
    }),
    gone,
    change: { path, text: texts.get(path) as string },
    whole: [...moved.keys(), path].filter((file) => whole.has(file)),
    after,
  };
}
