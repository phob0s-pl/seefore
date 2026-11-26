import type { ModelRead, ModelRecord } from './answer.ts';
// The rules before the rules of a team's own: `judge.ts` and `rules.ts` import each other, and only this order reads.
import { FIELDS, nearest } from './rules.ts';
import { ruleReferences } from './judge.ts';
import { changesOf } from './changes.ts';
import type { Changes, Verb } from './changes.ts';
import { KINDS, ofModel } from './kinds.ts';
import { changeMark } from './mark.ts';
import { stepsOf } from './model.ts';
import { list, quote } from './problem.ts';

/**
 * What `seefore list` prints, worked out from what the check read: one line a record, so that a
 * skill finds every record without reading the files. Nothing here reads the disk or prints.
 */

/** What is asked of `list`: some folders alone; one record and what it names and is named by; the model as a change would make it; or the changes. */
export type ListAsked = { folders?: readonly string[]; near?: string; change?: string; changes?: boolean };

/** The folders of the records of the model, in their order: every folder but `changes` and `reviews`. */
const FOLDERS: readonly string[] = KINDS.map((kind) => kind.folder).filter(ofModel);

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** The order of the lines: by folder, then by id. */
function byPlace(a: ModelRecord, b: ModelRecord): number {
  const folders = FOLDERS.indexOf(a.kind) - FOLDERS.indexOf(b.kind);
  return folders !== 0 ? folders : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** One record in a line: its path, its name, and what it has of what it is in, its two ends and what lies between them, its feature and steps, and its kind; a repository checked out beside the model ends with `workspace`. */
function recordLine(record: ModelRecord): string {
  const fields = record.fields;
  const parts = [`${record.kind}/${record.id}`, text(fields.name) ?? text(fields.must) ?? text(fields.prefer) ?? (record.kind === 'connections' ? 'No name' : record.id)];
  if (text(fields.in) !== undefined) parts.push(`in ${fields.in as string}`);
  if (record.kind === 'connections') {
    // What it passes through stands in the line: without it a reader takes a connection through a proxy for a direct one.
    const via = Array.isArray(fields.via) ? fields.via.filter((id): id is string => typeof id === 'string') : [];
    parts.push(`${String(fields.from)} -> ${String(fields.to)}${via.length > 0 ? ` via ${via.join(', ')}` : ''}`);
  }
  if (record.kind === 'flows') {
    if (text(fields.feature) !== undefined) parts.push(fields.feature as string);
    const steps = Array.isArray(fields.steps) ? fields.steps.length : 0;
    parts.push(steps === 1 ? '1 step' : `${steps} steps`);
  }
  if (text(fields.kind) !== undefined) parts.push(fields.kind as string);
  if (record.kind === 'repositories' && fields.workspace === true) parts.push('workspace');
  return parts.join('  ');
}

/** The ids a record names, by the same fields the check holds: those of `FIELDS`, and for a rule of a team's own, those it names in its selectors and its debt. */
function namesOf(record: ModelRecord): Set<string> {
  const entry = { id: record.id, kind: record.kind, file: record.file, ok: true, fields: record.fields, at: new Map() };
  const named = new Set<string>();
  for (const spec of FIELDS) {
    if (spec.folder !== record.kind) continue;
    const holders = spec.step ? stepsOf(entry).map((step) => step.fields) : [record.fields];
    for (const fields of holders) {
      const value = fields[spec.field];
      if (Array.isArray(value)) for (const id of value) if (typeof id === 'string') named.add(id);
      if (typeof value === 'string') named.add(value);
    }
  }
  if (record.kind === 'rules') for (const reference of ruleReferences(entry)) named.add(reference.id);
  return named;
}

/**
 * Who is next on a change, from its review: the corrector while a block is open, the second reading
 * while a point of either severity is fixed, the person while a block is declined or reopened. A
 * note that is open, declined or reopened waits for nobody; one that is fixed was corrected, and the
 * correction is read again as a block's is.
 */
function nextOn(changes: Changes, id: string): string {
  const review = changes.review(id);
  if (review === undefined) return 'no review';
  const count = (status: string) => review.points.filter((point) => point.severity === 'block' && point.status === status).length;
  const fixed = review.points.filter((point) => point.status === 'fixed').length;
  if (count('open') > 0) return `the corrector: ${count('open')} open`;
  if (fixed > 0) return `the second reading: ${fixed} fixed`;
  const person = (['declined', 'reopened'] as const).filter((status) => count(status) > 0).map((status) => `${count(status)} ${status}`);
  return person.length > 0 ? `the person: ${person.join(', ')}` : 'nothing open';
}

/** The changes in the order of their ids, as their files lie. */
const byId = (changes: Changes) => [...changes.all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/**
 * One line a change: its path, its name, who is next, and its mark, which a review writes into
 * `read`; or, once it is decided, `applied` or `rejected`, since its reading is over.
 */
function changeLines(changes: Changes, records: readonly ModelRecord[]): string[] {
  // Each change is the first record of `changes/` with its id, as in the changes' views.
  const marks = new Map<string, string>();
  for (const record of records) if (record.kind === 'changes' && !marks.has(record.id)) marks.set(record.id, changeMark(record.fields));
  return byId(changes).map((change) => [`changes/${change.id}`, change.name, ...(change.status !== undefined ? [change.status] : [nextOn(changes, change.id), marks.get(change.id) as string])].join('  '));
}

/** An id or a path that names no record: the error, with the nearest id. */
function unknown(id: string, ids: readonly string[]): string {
  const close = nearest(id, ids);
  return `No record has the id ${quote(id)}.${close !== undefined ? ` The nearest id is ${quote(close)}.` : ''}`;
}

/**
 * What `seefore list` prints: its lines, or the one line of an error. `folders` keeps the records
 * of those folders; `near` gives one record, then under `names:` each record it names and under
 * `named by:` each that names it, and for a repository under `through their system:` each app
 * whose code is in it as its system's, or for an app under `its system's repository:` that one;
 * `change` lists the model as that change would make it, each line marked `+`, `~` or `-` for a
 * record it adds, updates or removes, and is an error for a decided change; `changes` lists the
 * changes.
 */
export function listLines(model: ModelRead, asked: ListAsked): { lines: string[] } | { error: string } {
  const changes = changesOf(model.records, model.laid);
  const folders = asked.folders ?? [];
  // `list changes` may come as the folder `changes`.
  if (asked.changes === true || (folders.length === 1 && folders[0] === 'changes')) {
    if (asked.near !== undefined || asked.change !== undefined) return { error: 'The changes are listed alone, with no record near and no change laid over the model.' };
    return { lines: changeLines(changes, model.records) };
  }
  for (const folder of folders) {
    if (folder === 'changes' || folder === 'reviews') return { error: `${quote(folder)} holds no records of the model. The changes are listed alone: \`changes\` gives each, with who is next.` };
    if (!FOLDERS.includes(folder)) {
      const close = nearest(folder, FOLDERS);
      return { error: `${quote(folder)} is not a folder of the model.${close !== undefined ? ` The nearest is ${quote(close)}.` : ''} The folders are ${list(FOLDERS)}, and \`changes\` lists the changes.` };
    }
  }

  // The records to list: those of today, or those the change would leave, with each it removes still there.
  const today = model.records.filter((record) => ofModel(record.kind));
  let shown = today;
  const marks = new Map<string, Verb>();
  if (asked.change !== undefined) {
    const change = changes.change(asked.change);
    if (change === undefined) {
      const ids = byId(changes).map((each) => each.id);
      const close = nearest(asked.change, ids);
      const which = close !== undefined ? ` The nearest is ${quote(close)}.` : ids.length > 0 ? ` The changes are ${list(ids)}.` : ' There are no changes.';
      return { error: `There is no change ${quote(asked.change)}.${which}` };
    }
    // A decided change is laid over the model no more: one applied is in it already.
    if (change.status === 'applied') return { error: `The change ${quote(change.id)} is applied: the model has its records already.` };
    if (change.status === 'rejected') return { error: `The change ${quote(change.id)} is rejected: it is not laid over the model.` };
    const world = changes.world(change.id);
    if (world === undefined) return { error: `The check could not lay the change ${quote(change.id)} over the model, so the model as it would be is not known. Run \`seefore check\` and mend changes/${change.id}.yaml.` };
    for (const touched of change.touched) marks.set(touched.path, touched.verb);
    const removed = today.filter((record) => marks.get(`${record.kind}/${record.id}`) === 'remove');
    shown = [...world.records, ...removed];
  }
  shown = [...shown].sort(byPlace);
  const marked = (record: ModelRecord): string => {
    if (asked.change === undefined) return recordLine(record);
    const verb = marks.get(`${record.kind}/${record.id}`);
    return `${verb === 'add' ? '+' : verb === 'update' ? '~' : verb === 'remove' ? '-' : ' '} ${recordLine(record)}`;
  };
  const kept = (record: ModelRecord): boolean => folders.length === 0 || folders.includes(record.kind);

  if (asked.near === undefined) return { lines: shown.filter(kept).map(marked) };

  // One record, by its id or by its path, and what is near it.
  const near = asked.near;
  const record = shown.find((each) => each.id === near || `${each.kind}/${each.id}` === near);
  if (record === undefined) return { error: unknown(near.includes('/') ? near.slice(near.indexOf('/') + 1) : near, shown.map((each) => each.id)) };
  const names = namesOf(record);
  const itNames = shown.filter((each) => each !== record && names.has(each.id) && kept(each));
  const namesIt = shown.filter((each) => each !== record && namesOf(each).has(record.id) && kept(each));
  // An app that names no repository has its code in its system's.
  const systemOf = (app: ModelRecord): ModelRecord | undefined =>
    app.kind === 'apps' && text(app.fields.repository) === undefined ? shown.find((each) => each.kind === 'systems' && each.id === app.fields.in) : undefined;
  const fromSystem = shown.filter((each) => each.kind === 'repositories' && each.id === systemOf(record)?.fields.repository && kept(each));
  const throughSystem = record.kind === 'repositories' ? shown.filter((each) => systemOf(each)?.fields.repository === record.id && kept(each)) : [];
  const lines = [marked(record)];
  if (itNames.length > 0) lines.push('names:', ...itNames.map((each) => `  ${marked(each)}`));
  if (fromSystem.length > 0) lines.push("its system's repository:", ...fromSystem.map((each) => `  ${marked(each)}`));
  if (namesIt.length > 0) lines.push('named by:', ...namesIt.map((each) => `  ${marked(each)}`));
  if (throughSystem.length > 0) lines.push('through their system:', ...throughSystem.map((each) => `  ${marked(each)}`));
  return { lines };
}
