import { Document, isMap, isScalar, isSeq, stringify } from 'yaml';
import type { z } from 'zod';
import type { ModelRecord, Problem } from './answer.ts';
import { idProblem } from './id.ts';
import { CHANGED_FOLDERS, RECORD_NOUNS } from './kinds.ts';
import type { Entry } from './model.ts';
import { error, list, quote, warning } from './problem.ts';
import type { Position } from './problem.ts';
import type { SourceFile } from './read.ts';
import { SHAPES } from './records.ts';
import { nearest } from './rules.ts';
import { checkShape, knownKeys } from './shape.ts';
import { keyPosition } from './yaml.ts';
import type { YamlFile } from './yaml.ts';

/**
 * The body of a change, held three ways: its own form, each record at its place in the file;
 * the change against the model, which must have what it updates and removes and lack what it
 * adds; and the model as it would be, the model with the change laid over it, read by the
 * whole check. A problem the model does not have today is a problem of the change. A decided
 * change is history, held in its form alone. The open changes are also held together: two
 * that write one key of one record are told at both.
 */

/** A change whose file reads: its file, and the YAML of it. */
export type ReadChange = { file: string; yaml: YamlFile };

/** The model a change is held against: its files, its records, its problems today, and the check that reads a model. Both give what the rules found while their rulings were withheld, too. */
export type Held = {
  files: readonly SourceFile[];
  entries: readonly Entry[];
  problems: readonly Problem[];
  read: (files: readonly SourceFile[]) => { problems: readonly Problem[]; records: readonly ModelRecord[] };
};

/**
 * What holding a change comes to: its problems, and, when it could be laid over the model, the
 * records it adds and updates as the check read them from the model as it would be.
 */
export type HeldChange = { problems: Problem[]; laid?: ModelRecord[] };

type Verb = 'add' | 'update' | 'remove';

/** A record named in a change: under which key, its path, and the nodes of where it is written. */
type Named = { verb: Verb; path: string; folder: string; id: string; key: unknown; value: unknown };

/** What is wrong with a path, or nothing: a path is a folder a change may name, and an id. */
function pathFault(path: string): string | undefined {
  const at = path.indexOf('/');
  if (at < 0) return `${quote(path)} is not the path of a record. A path is a folder and an id, as \`apps/app-ledger\`.`;
  const folder = path.slice(0, at);
  const id = path.slice(at + 1);
  if (folder === 'changes') return `${quote(path)} names a change. A change adds, updates and removes records of the model, and no change.`;
  if (folder === 'reviews') return `${quote(path)} names a review. A change adds, updates and removes records of the model, and no review.`;
  if (!CHANGED_FOLDERS.includes(folder)) return `${quote(path)} is not the path of a record: there is no folder ${quote(folder)}. The folders are ${list(CHANGED_FOLDERS)}.`;
  if (id.endsWith('.yaml')) return `${quote(path)} is the name of a file. A path leaves \`.yaml\` off, as ${quote(path.slice(0, -'.yaml'.length))}.`;
  const wrong = idProblem(id);
  return wrong === undefined ? undefined : `${quote(path)} is not the path of a record. ${wrong}`;
}

const sameValue = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** The steps of a flow as a change writes them, with each bare id become the step the flow has today. */
export function stepsAfter(live: unknown, written: readonly unknown[]): unknown[] {
  const old = Array.isArray(live) ? (live as { id?: unknown }[]) : [];
  return written.map((step) => (typeof step === 'string' ? (old.find((each) => each.id === step) ?? step) : step));
}

/** Whether a change is decided: applied or rejected. An open change has no `status`. */
const decided = (status: unknown): boolean => status === 'applied' || status === 'rejected';

/**
 * One change held: its problems of form, against the model and of the model as it would be, and
 * the records as they would be. A decided change is held in its form alone, and is not laid.
 */
export function holdChange(change: ReadChange, held: Held): HeldChange {
  const { file, yaml } = change;
  const doc = yaml.doc;
  if (!doc) return { problems: [] };
  const problems: Problem[] = [];
  const named: Named[] = [];
  const body = doc.toJS() as { add?: Record<string, unknown>; update?: Record<string, Record<string, unknown>>; remove?: string[]; status?: string; why?: string };

  // ---- the form: the decision, each path, and each record at its place in the file
  if (yaml.map !== undefined && body.why !== undefined && body.status !== 'rejected')
    problems.push({
      ...error(file, keyPosition(yaml, yaml.map, 'why'), 'change-status', '`why` goes with `status: rejected` alone: it holds the person\'s reason for a no.', 'Take `why` out, or write `status: rejected`.'),
      field: 'why',
    });
  if (yaml.map !== undefined && body.status === 'rejected' && body.why === undefined)
    problems.push({
      ...error(file, keyPosition(yaml, yaml.map, 'status'), 'change-status', '`status: rejected` needs `why`: the person\'s reason for the no, in one line.', 'Write `why` with the reason the person gave. If they gave none, ask them.'),
      field: 'status',
    });
  for (const verb of ['add', 'update'] as const) {
    const map = doc.get(verb, true);
    if (!isMap(map)) continue;
    if (map.items.length === 0) problems.push(error(file, yaml.at(map), 'value-too-small', `${quote(verb)} is empty.`, `Name a record under ${quote(verb)}, or take the key out.`));
    for (const pair of map.items) {
      const path = isScalar(pair.key) ? String(pair.key.value) : '';
      const fault = pathFault(path);
      if (fault !== undefined) {
        problems.push({ ...error(file, yaml.at(pair.key), 'change-path', fault), field: verb });
        continue;
      }
      const [folder, id] = [path.slice(0, path.indexOf('/')), path.slice(path.indexOf('/') + 1)];
      const noun = RECORD_NOUNS[folder] as string;
      if (!isMap(pair.value)) {
        const what = verb === 'add' ? `the record as its own file would hold it` : `the keys of the record that change`;
        problems.push({ ...error(file, yaml.at(pair.value ?? pair.key), 'value-wrong-kind', `${quote(path)} under ${quote(verb)} must be a mapping: ${what}.`), field: verb });
        continue;
      }
      named.push({ verb, path, folder, id, key: pair.key, value: pair.value });
      const shape = SHAPES[folder as keyof typeof SHAPES] as z.ZodType;
      if (verb === 'add') {
        // The record is held by the shape of its folder, as its own file would be, at its lines in this file.
        const record = new Document();
        record.contents = pair.value as never;
        problems.push(...checkShape(file, { ...yaml, doc: record, map: pair.value }, shape, quote(path)).problems.map((problem) => ({ ...problem, field: verb })));
        continue;
      }
      if (pair.value.items.length === 0)
        problems.push({ ...error(file, yaml.at(pair.value), 'value-too-small', `${quote(path)} under \`update\` names no key.`, 'Write the keys that change, or take the record out of `update`.'), field: verb });
      const known = knownKeys(shape, []);
      for (const item of pair.value.items) {
        const key = isScalar(item.key) ? String(item.key.value) : '';
        if (!known.includes(key))
          problems.push({
            ...error(file, keyPosition(yaml, pair.value, key), 'key-unknown', `${quote(key)} is not a key of ${noun}. Its keys are ${list(known)}.`, `Delete the key ${quote(key)} from ${quote(path)}, or, if a known key was meant, rename it.`),
            field: verb,
          });
      }
    }
  }
  const removed = doc.get('remove', true);
  if (isSeq(removed))
    for (const item of removed.items) {
      const path = isScalar(item) ? String(item.value) : '';
      const fault = pathFault(path);
      if (fault !== undefined) problems.push({ ...error(file, yaml.at(item), 'change-path', fault), field: 'remove' });
      else named.push({ verb: 'remove', path, folder: path.slice(0, path.indexOf('/')), id: path.slice(path.indexOf('/') + 1), key: item, value: item });
    }
  // A record is in a change once, whatever its folder: its id names it.
  const first = new Map<string, Named>();
  for (const each of named) {
    const before = first.get(each.id);
    if (before === undefined) first.set(each.id, each);
    else {
      const where = before.verb === each.verb ? `twice under ${quote(each.verb)}` : `under ${quote(before.verb)} and under ${quote(each.verb)}`;
      problems.push({ ...error(file, yaml.at(each.key), 'change-twice', `${quote(each.id)} is in this change ${where}. A record is in a change once.`), field: each.verb });
    }
  }
  // A decided change is history: what it adds may be there now, what it removes gone, so it is held against no model.
  if (problems.length > 0 || decided(body.status)) return { problems };

  // ---- against the model: what it adds is not there, what it updates and removes is
  const records = new Map<string, Entry>();
  for (const entry of held.entries) if (!records.has(entry.id)) records.set(entry.id, entry);
  const after = new Map<string, Record<string, unknown>>();
  for (const each of named) {
    const live = records.get(each.id);
    const at = yaml.at(each.key);
    if (each.verb === 'add') {
      if (live === undefined) continue;
      const there = live.kind === each.folder ? 'To change it, write it under `update`.' : 'An id names one record in the whole model, whatever its folder. Give the new record another id.';
      problems.push({ ...error(file, at, 'change-add-exists', `\`add\` holds ${quote(each.path)}, but ${quote(live.file)} is there already.`, there), field: 'add' });
      continue;
    }
    if (live === undefined || live.kind !== each.folder) {
      const close = live === undefined ? nearest(each.id, held.entries.filter((entry) => entry.kind === each.folder).map((entry) => entry.id)) : undefined;
      const message =
        live !== undefined
          ? `${quote(each.verb)} names ${quote(each.path)}, but ${quote(each.id)} is in ${quote(live.kind)}.`
          : `${quote(each.verb)} names ${quote(each.path)}, but no record has that id.${close ? ` The nearest id is ${quote(close)}.` : ''}`;
      const fix = live !== undefined ? `Write ${quote(`${live.kind}/${each.id}`)}.` : each.verb === 'update' ? 'Use the path of a record that is there, or, if the record is new, write it whole under `add`.' : 'Use the path of a record that is there, or take the line out.';
      problems.push({ ...error(file, at, 'change-no-record', message, fix), field: each.verb });
      continue;
    }
    if (each.verb === 'remove') continue;
    if (!live.ok) {
      problems.push({ ...error(file, at, 'change-no-record', `\`update\` names ${quote(each.path)}, but ${quote(live.file)} has problems of its own, so the change cannot be laid over it.`, `Mend ${quote(live.file)} first.`), field: 'update' });
      continue;
    }
    const merged: Record<string, unknown> = { ...live.fields };
    const map = each.value as { items: { key: unknown; value: unknown }[] };
    for (const item of map.items) {
      const key = isScalar(item.key) ? String(item.key.value) : '';
      let value = body.update?.[each.path]?.[key];
      if (key === 'steps' && each.folder === 'flows' && Array.isArray(value)) {
        const has = new Set((Array.isArray(live.fields['steps']) ? (live.fields['steps'] as { id?: unknown }[]) : []).map((step) => step.id));
        const items = isSeq(item.value) ? item.value.items : [];
        value.forEach((step, index) => {
          if (typeof step === 'string' && !has.has(step))
            problems.push({
              ...error(file, yaml.at(items[index]), 'change-step-unknown', `\`steps\` of ${quote(each.path)} names the step ${quote(step)}, but the flow has no step with that id.`, 'A bare id is a step that stays as it is. Write a new step whole, with its `id` and what it is on.'),
              field: 'update',
            });
        });
        value = stepsAfter(live.fields['steps'], value);
      }
      if (value === null || value === undefined) {
        if (!(key in live.fields)) problems.push({ ...warning(file, yaml.at(item.key), 'change-no-effect', `\`update\` takes ${quote(key)} out of ${quote(each.path)}, but the record has no ${quote(key)}.`, 'Take the line out.'), field: 'update' });
        delete merged[key];
      } else {
        if (sameValue(value, live.fields[key])) problems.push({ ...warning(file, yaml.at(item.key), 'change-no-effect', `${quote(key)} of ${quote(each.path)} under \`update\` is what the record says already.`, 'Take the line out.'), field: 'update' });
        merged[key] = value;
      }
    }
    after.set(each.path, merged);
  }
  if (problems.some((problem) => problem.severity === 'error')) return { problems };

  // ---- the model as it would be: the model with the change laid over it, read by the whole check
  const gone = new Set(named.filter((each) => each.verb !== 'add').map((each) => `${each.path}.yaml`));
  const laid: SourceFile[] = held.files.filter((source) => !source.path.startsWith('changes/') && !gone.has(source.path));
  for (const each of named) {
    if (each.verb === 'add') laid.push({ path: `${each.path}.yaml`, text: stringify(body.add?.[each.path], { lineWidth: 0 }) });
    if (each.verb === 'update') laid.push({ path: `${each.path}.yaml`, text: stringify(after.get(each.path), { lineWidth: 0 }) });
  }
  const today = new Set(held.problems.map((problem) => `${problem.rule}\n${problem.file}\n${problem.message}`));
  const written = new Map(named.filter((each) => each.verb !== 'remove').map((each) => [`${each.path}.yaml`, each]));
  const read = held.read(laid);
  for (const found of read.problems) {
    if (today.has(`${found.rule}\n${found.file}\n${found.message}`)) continue;
    const path = found.file.endsWith('.yaml') ? found.file.slice(0, -'.yaml'.length) : found.file;
    const record = written.get(found.file);
    // At the key at fault where the change writes it, else at the record; a record the change does not write is told at `remove`.
    const key = record !== undefined && found.field !== undefined ? doc.getIn([record.verb, record.path, found.field], true) : undefined;
    const at = yaml.at(key ?? record?.key ?? doc.get('remove', true));
    const make = found.severity === 'warning' ? warning : error;
    problems.push({ ...make(file, at, found.rule, `With this change, ${quote(path)}: ${found.message}`, found.fix), field: record?.verb ?? 'remove' });
  }
  // The records the change writes, as that reading has them: what the page shows is what was judged.
  return { problems, laid: read.records.filter((record) => written.has(record.file)) };
}

/**
 * The open changes held together: where two or more write the same key of the same record under
 * `update`, it is told at each of them, at that key in its file. An update replaces a key whole,
 * so whichever is applied second undoes the first there. Two that write the key alike undo
 * nothing, and are not told. It is told whatever else is wrong with a change whose file reads; a
 * decided change is no part of it.
 */
export function sameKeys(changes: readonly (ReadChange & { id: string })[]): Problem[] {
  // Each key of each record an open change updates: the changes that write it, where each writes it, and what.
  const writers = new Map<string, { id: string; file: string; at: Position; value: unknown }[]>();
  for (const change of changes) {
    const doc = change.yaml.doc;
    if (doc === undefined || decided(doc.get('status'))) continue;
    const update = doc.get('update', true);
    if (!isMap(update)) continue;
    const body = doc.toJS() as { update?: Record<string, Record<string, unknown> | null> };
    for (const pair of update.items) {
      const path = isScalar(pair.key) ? String(pair.key.value) : '';
      if (pathFault(path) !== undefined || !isMap(pair.value)) continue;
      for (const item of pair.value.items) {
        if (!isScalar(item.key)) continue;
        const key = String(item.key.value);
        const where = `${path}\n${key}`;
        const each = writers.get(where) ?? [];
        each.push({ id: change.id, file: change.file, at: change.yaml.at(item.key), value: body.update?.[path]?.[key] ?? null });
        writers.set(where, each);
      }
    }
  }
  const problems: Problem[] = [];
  for (const [where, each] of writers) {
    if (each.length < 2) continue;
    const [path, key] = where.split('\n') as [string, string];
    for (const one of each) {
      const others = each.filter((other) => other !== one && !sameValue(other.value, one.value)).map((other) => other.id);
      if (others.length === 0) continue;
      const by = others.length === 1 ? `the change ${list(others)}` : `the changes ${list(others)}`;
      problems.push({
        ...warning(one.file, one.at, 'change-same-key', `${quote(key)} of ${quote(path)} is also written by ${by}. An update replaces a key whole, so the one applied second undoes what the first wrote there.`, 'Apply one of them, then write this key anew in the other, from the record as it is then.'),
        record: one.id,
        field: 'update',
      });
    }
  }
  return problems;
}
