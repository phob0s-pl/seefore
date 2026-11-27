import { isMap, isScalar, isSeq } from 'yaml';
import type { Document, Scalar, YAMLMap } from 'yaml';
import { idProblem } from './id.ts';
import { ruleReferences } from './judge.ts';
import { KINDS, WORDS, folderOfId, ofModel } from './kinds.ts';
import type { Entry } from './model.ts';
import { list, quote } from './problem.ts';
import type { SourceFile } from './read.ts';
import { FIELDS, nearest } from './rules.ts';
import { parseText } from './yaml.ts';

/**
 * `seefore rename`: records renamed in the texts of a model's files. Each place that names a
 * record is found where the check finds it, by `FIELDS` and `ruleReferences`, and by the paths of
 * changes and reviews; there only the id's own characters change. A file is never written anew
 * from its parsed form, so its comments, quotes, order and layout stay. Pure: files in, files out.
 */

/** One line of a rename: `old` is an id or `folder/id`, `new` an id whose first word says its folder. `line` is its line in a list. */
export type Rename = { old: string; new: string; line?: number };

/** What a rename did. */
export type RenameAccount = {
  /** Each record renamed: by a line of the list, or with its end, which `follows` names. */
  renamed: { old: string; new: string; follows?: string }[];
  /** Each file moved or rewritten: its path before and after, and how many places in it were rewritten. */
  files: { from: string; to: string; places: number }[];
  /** Each connection that names a renamed end in its id and was left as it is, with what it would have been and why not. */
  left: { id: string; would: string; why: string }[];
  /** Each place left as it is because two records have its id and it cannot be told which it names. */
  unsure: { file: string; line: number; id: string }[];
  /** Each line where an old id stands in backticks, as prose does: left as it is. */
  prose: { file: string; line: number; text: string }[];
};

export type Renamed = { files: SourceFile[]; account: RenameAccount };
export type Refused = { refusals: string[] };

/** The folders a file of the model may be in. */
const FOLDERS: readonly string[] = KINDS.map((kind) => kind.folder);

/** A record of the model: its folder and id, its own file, or none when only a change adds it. */
type Claim = { folder: string; id: string; file?: string; added: string[] };

/** A record to rename: who it is today, and its new id and folder. */
type Target = { old: string; new: string; folder: string; newFolder: string; file?: string; follows?: string };

/** One place to rewrite in a file: the characters from `start` to `end` become `text`. */
type Edit = { start: number; end: number; text: string };

const pathOf = (folder: string, id: string): string => `${folder}/${id}`;

/** Reads a list of renames: one `old new` on a line, blank lines left out. */
export function readRenames(text: string): Rename[] | Refused {
  const renames: Rename[] = [];
  const refusals: string[] = [];
  text.split(/\r?\n|\r/).forEach((written, index) => {
    const words = written.trim().split(/\s+/).filter((word) => word !== '');
    if (words.length === 0) return;
    if (words.length !== 2) refusals.push(`Line ${index + 1} of the list holds ${words.length === 1 ? 'one word' : `${words.length} words`}. A line holds the old id and the new, as \`monitoring app-monitoring\`.`);
    else renames.push({ old: words[0] as string, new: words[1] as string, line: index + 1 });
  });
  if (refusals.length > 0) return { refusals };
  if (renames.length === 0) return { refusals: ['The list holds no line. A line holds the old id and the new, as `monitoring app-monitoring`.'] };
  return renames;
}

/**
 * Renames records in a model's files. All lines are done as one, so `a b` with `b c` is no clash.
 * Gives the files as they would be, all of them, and an account of what was done; or the
 * refusals, and then nothing is done.
 */
export function renameRecords(files: readonly SourceFile[], renames: readonly Rename[]): Renamed | Refused {
  if (renames.length === 0) return { refusals: ['Nothing is named to rename.'] };
  const refusals: string[] = [];
  const known = files.flatMap((file) => {
    const match = /^([a-z]+)\/([^/]+)\.yaml$/.exec(file.path);
    return match && FOLDERS.includes(match[1] as string) ? [{ ...file, folder: match[1] as string, id: match[2] as string }] : [];
  });
  // Each file of a known folder as YAML, or nothing when it cannot be read as a mapping.
  const docs = new Map<string, Document.Parsed | undefined>();
  for (const file of known) {
    const doc = parseText(file.text);
    docs.set(file.path, doc.errors.length === 0 && isMap(doc.contents) ? doc : undefined);
  }

  // ---- the records of the model: each file of its folders, and each that a change adds
  const claims = new Map<string, Claim[]>();
  const claim = (folder: string, id: string, file: string | undefined, change: string | undefined) => {
    const all = claims.get(id) ?? [];
    let found = all.find((each) => each.folder === folder);
    if (found === undefined) all.push((found = { folder, id, added: [] }));
    if (file !== undefined) found.file = file;
    if (change !== undefined) found.added.push(change);
    claims.set(id, all);
  };
  const changeIds = new Set<string>();
  for (const file of known) {
    if (ofModel(file.folder) && idProblem(file.id) === undefined) claim(file.folder, file.id, file.path, undefined);
    if (file.folder !== 'changes') continue;
    changeIds.add(file.id);
    const add = docs.get(file.path)?.get('add', true);
    if (isMap(add))
      for (const pair of add.items) {
        const path = splitPath(isScalar(pair.key) ? String(pair.key.value) : '');
        if (path !== undefined && ofModel(path.folder) && FOLDERS.includes(path.folder) && idProblem(path.id) === undefined) claim(path.folder, path.id, undefined, file.path);
      }
  }
  const claimsOf = (id: string): Claim[] => claims.get(id) ?? [];
  const where = (each: Claim): string => (each.file !== undefined ? quote(each.file) : `${quote(pathOf(each.folder, each.id))}, which ${list(each.added)} ${each.added.length === 1 ? 'adds' : 'add'}`);
  const among = (claimed: readonly Claim[]): string => joined(claimed.map(where));

  // ---- each line: the record it names, and its new id
  const targets: Target[] = [];
  for (const rename of renames) {
    const at = rename.line !== undefined ? `Line ${rename.line} of the list: ` : '';
    const path = rename.old.includes('/') ? splitPath(rename.old) : undefined;
    const folder = path?.folder;
    const id = path?.id ?? rename.old;
    if (folder === 'changes' || folder === 'reviews' || (folder === undefined && claimsOf(id).length === 0 && changeIds.has(id))) {
      refusals.push(`${at}${quote(rename.old)} names ${folder === 'reviews' ? 'a review' : 'a change'}. \`rename\` renames records of the model; a change and its review keep their id.`);
      continue;
    }
    const found = claimsOf(id).filter((each) => folder === undefined || each.folder === folder);
    if (found.length === 0) {
      const close = nearest(id, [...claims.keys()]);
      refusals.push(`${at}${quote(rename.old)} names no record: no file of the model has that id, and no change adds it.${close !== undefined ? ` The nearest id is ${quote(close)}.` : ''}`);
      continue;
    }
    if (found.length > 1) {
      refusals.push(`${at}${quote(id)} is the id of ${found.length} records: ${among(found)}. Say which one, as ${quote(pathOf((found[0] as Claim).folder, id))}.`);
      continue;
    }
    const wrong = idProblem(rename.new);
    const newFolder = folderOfId(rename.new);
    if (wrong !== undefined) refusals.push(`${at}${wrong}`);
    else if (newFolder === undefined)
      refusals.push(
        `${at}${quote(rename.new)} does not begin with the word of a folder, so it does not say its kind. Begin it with ${list(Object.values(WORDS).map((word) => `${word}-`))}, as ${quote(`${WORDS[(found[0] as Claim).folder] ?? 'app'}-${rename.new}`)}.`,
      );
    else if (rename.new === id) refusals.push(`${at}${quote(id)} is its id already, so there is nothing to rename.`);
    else {
      const record = found[0] as Claim;
      targets.push({ old: id, new: rename.new, folder: record.folder, newFolder, ...(record.file !== undefined ? { file: record.file } : {}) });
    }
  }
  const byPath = new Map<string, Target>();
  const byNew = new Map<string, Target>();
  for (const target of targets) {
    const path = pathOf(target.folder, target.old);
    const before = byPath.get(path);
    if (before !== undefined) refusals.push(`${quote(path)} is renamed twice in the list: to ${quote(before.new)} and to ${quote(target.new)}. Keep one.`);
    else byPath.set(path, target);
    const other = byNew.get(target.new);
    if (other !== undefined) refusals.push(`${quote(target.new)} is the new id of both ${quote(other.old)} and ${quote(target.old)}. Give each its own.`);
    else byNew.set(target.new, target);
  }
  // A new id is taken when a record keeps it: one that is renamed in the same list gives it up.
  for (const target of targets) {
    const keeps = claimsOf(target.new).filter((each) => !byPath.has(pathOf(each.folder, each.id)));
    if (keeps.length > 0) refusals.push(`${quote(target.new)} is taken: ${among(keeps)} has it. Give ${quote(target.old)} another id, or rename that one too in a list.`);
  }

  // ---- a connection that names a renamed end in its own id follows it, unless the list renames it
  const left: RenameAccount['left'] = [];
  if (refusals.length === 0) {
    const ids = new Set(claims.keys());
    // Every id that is left first, then every id that is taken: else `x b` with `b c` would free `b` again.
    for (const target of targets) if (claimsOf(target.old).length === 1) ids.delete(target.old);
    for (const target of targets) ids.add(target.new);
    const connections: { id: string; file?: string; ends: string[] }[] = [];
    const endsOf = (map: YAMLMap): string[] => ['from', 'to'].flatMap((key) => {
      const node = map.get(key, true);
      return isScalar(node) && typeof node.value === 'string' ? [node.value] : [];
    });
    for (const file of known) {
      const doc = docs.get(file.path);
      if (doc !== undefined && file.folder === 'connections' && idProblem(file.id) === undefined) connections.push({ id: file.id, file: file.path, ends: endsOf(doc.contents as YAMLMap) });
    }
    for (const file of known) {
      const add = file.folder === 'changes' ? docs.get(file.path)?.get('add', true) : undefined;
      if (isMap(add))
        for (const pair of add.items) {
          const path = splitPath(isScalar(pair.key) ? String(pair.key.value) : '');
          if (path?.folder === 'connections' && isMap(pair.value) && !connections.some((each) => each.id === path.id)) connections.push({ id: path.id, ends: endsOf(pair.value) });
        }
    }
    connections.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    for (const connection of connections) {
      if (byPath.has(pathOf('connections', connection.id)) || claimsOf(connection.id).length !== 1) continue;
      const moves = connection.ends.flatMap((end) => {
        const target = claimsOf(end).length === 1 ? byPath.get(pathOf((claimsOf(end)[0] as Claim).folder, end)) : undefined;
        if (target === undefined) return [];
        const from = tailOf(target.old, target.folder);
        const to = tailOf(target.new, target.newFolder);
        return from === to ? [] : [{ end: target.old, from: from.split('-'), to: to.split('-') }];
      });
      if (moves.length === 0) continue;
      const followed = follow(connection.id, moves);
      if (followed.id === connection.id) continue;
      const wrong = idProblem(followed.id);
      if (wrong !== undefined) left.push({ id: connection.id, would: followed.id, why: `it would have ${[...followed.id].length} characters, and an id has at most 80` });
      else if (ids.has(followed.id)) left.push({ id: connection.id, would: followed.id, why: `${quote(followed.id)} is taken` });
      else {
        ids.delete(connection.id);
        ids.add(followed.id);
        const target: Target = { old: connection.id, new: followed.id, folder: 'connections', newFolder: 'connections', follows: followed.ends.join(' and '), ...(connection.file !== undefined ? { file: connection.file } : {}) };
        targets.push(target);
        byPath.set(pathOf('connections', connection.id), target);
      }
    }
  }

  // ---- a file that names an old id and is no YAML cannot be rewritten
  const olds = targets.map((target) => target.old);
  for (const file of known) {
    if (docs.get(file.path) !== undefined) continue;
    const named = olds.filter((old) => new RegExp(`(?<![a-z0-9-])${escaped(old)}(?![a-z0-9-])`).test(file.text));
    if (named.length > 0)
      refusals.push(`${quote(file.path)} names ${list(named)}, and YAML cannot read it as a mapping, so it cannot be rewritten. Mend it as \`seefore check\` says, and rename again.`);
  }
  if (refusals.length > 0) return { refusals };

  // ---- every place that names a renamed record, in every file
  /** The record a reference names, when it is renamed: by its id alone, or, when two records have it, by the kinds its field may name. */
  const unsure: RenameAccount['unsure'] = [];
  const renamedRef = (id: string, kinds: readonly string[]): Target | 'unsure' | undefined => {
    const all = claimsOf(id);
    if (all.length === 1) return byPath.get(pathOf((all[0] as Claim).folder, id));
    const fit = all.filter((each) => kinds.includes(each.folder));
    if (fit.length === 1) return byPath.get(pathOf((fit[0] as Claim).folder, id));
    return all.some((each) => byPath.has(pathOf(each.folder, id))) ? 'unsure' : undefined;
  };
  const renamedPath = (path: string): string | undefined => {
    const [record, step] = path.split('#') as [string, string | undefined];
    const parts = splitPath(record);
    const target = parts === undefined ? undefined : byPath.get(pathOf(parts.folder, parts.id));
    return target === undefined ? undefined : `${pathOf(target.newFolder, target.new)}${step !== undefined ? `#${step}` : ''}`;
  };

  const out: SourceFile[] = [];
  const done: RenameAccount['files'] = [];
  const moved = new Map(targets.flatMap((target) => (target.file !== undefined ? [[target.file, `${pathOf(target.newFolder, target.new)}.yaml`]] : [])));
  for (const file of files) {
    const to = moved.get(file.path) ?? file.path;
    const doc = docs.get(file.path);
    const kind = known.find((each) => each.path === file.path)?.folder;
    const edits: Edit[] = [];
    const rewrite = (node: Scalar, value: string) => {
      const range = node.range as [number, number, number];
      const raw = file.text.slice(range[0], range[1]);
      const old = String(node.value);
      const text = raw === old ? value : raw === `"${old}"` ? `"${value}"` : raw === `'${old}'` ? `'${value}'` : undefined;
      if (text === undefined) refusals.push(`${quote(file.path)} names ${quote(old)} at line ${lineAt(file.text, range[0])} in a form that cannot be rewritten in place. Write it plainly, as ${quote(old)}, and rename again.`);
      else if (!edits.some((edit) => edit.start === range[0])) edits.push({ start: range[0], end: range[1], text });
    };
    const refer = (node: Scalar, kinds: readonly string[]) => {
      const target = renamedRef(String(node.value), kinds);
      if (target === 'unsure') unsure.push({ file: to, line: lineAt(file.text, (node.range as [number, number, number])[0]), id: String(node.value) });
      else if (target !== undefined) rewrite(node, target.new);
    };
    const referPath = (node: unknown) => {
      if (!isScalar(node) || typeof node.value !== 'string') return;
      const value = renamedPath(node.value);
      if (value !== undefined) rewrite(node, value);
    };
    if (doc !== undefined && kind !== undefined) {
      const top = doc.contents as YAMLMap;
      if (ofModel(kind)) for (const spot of spotsOf(doc, kind, top)) refer(spot.node, spot.kinds);
      if (kind === 'changes') {
        for (const verb of ['add', 'update']) {
          const map = top.get(verb, true);
          if (!isMap(map)) continue;
          for (const pair of map.items) {
            referPath(pair.key);
            const path = splitPath(isScalar(pair.key) ? String(pair.key.value) : '');
            if (path !== undefined && FOLDERS.includes(path.folder) && ofModel(path.folder) && isMap(pair.value)) for (const spot of spotsOf(doc, path.folder, pair.value)) refer(spot.node, spot.kinds);
          }
        }
        const removed = top.get('remove', true);
        if (isSeq(removed)) removed.items.forEach(referPath);
      }
      if (kind === 'reviews') {
        const points = top.get('points', true);
        if (isMap(points))
          for (const pair of points.items) {
            const about = isMap(pair.value) ? pair.value.get('about', true) : undefined;
            if (isSeq(about)) about.items.forEach(referPath);
          }
      }
    }
    // From the end of the file backwards, so that each place is where it was found.
    let text = file.text;
    for (const edit of [...edits].sort((a, b) => b.start - a.start)) text = text.slice(0, edit.start) + edit.text + text.slice(edit.end);
    out.push({ path: to, text });
    if (to !== file.path || edits.length > 0) done.push({ from: file.path, to, places: edits.length });
  }
  // Two files written to one path would leave one text: held here whatever led to it.
  for (const [index, file] of done.entries()) {
    const first = done.findIndex((each) => each.to === file.to);
    if (first !== index) refusals.push(`${quote((done[first] as { from: string }).from)} and ${quote(file.from)} would both be written to ${quote(file.to)}. Give each its own id.`);
  }
  if (refusals.length > 0) return { refusals };

  // ---- prose: each line where an old id stands in backticks, alone or in a path
  const prose: RenameAccount['prose'] = [];
  const ticked = new RegExp(`\`(?:[a-z]+/)?(?:${olds.map(escaped).join('|')})(?:#[a-z0-9-]*)?\``);
  for (const file of out)
    file.text.split('\n').forEach((line, index) => {
      if (ticked.test(line)) prose.push({ file: file.path, line: index + 1, text: line.trim() });
    });

  return {
    files: out,
    account: {
      renamed: targets.map((target) => ({ old: target.old, new: target.new, ...(target.follows !== undefined ? { follows: target.follows } : {}) })),
      files: done.sort((a, b) => (a.to < b.to ? -1 : a.to > b.to ? 1 : 0)),
      left,
      unsure,
      prose,
    },
  };
}

/** Words joined as people join them: "a", "a and b", "a, b and c". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/** Text to be found as it is written, in a regular expression. */
const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');

/** A path as `folder/id`, or nothing when it is not one. */
function splitPath(path: string): { folder: string; id: string } | undefined {
  const at = path.indexOf('/');
  return at > 0 && at < path.length - 1 ? { folder: path.slice(0, at), id: path.slice(at + 1) } : undefined;
}

/** The part of an id after the word of its folder, as `puma` of `app-puma`. An id without the word is all its own part. */
function tailOf(id: string, folder: string): string {
  const word = WORDS[folder];
  return word !== undefined && id.startsWith(`${word}-`) ? id.slice(word.length + 1) : id;
}

/** The id of a connection with each end's part put in place of the old one, group by group, as `connection-puma-caches` to `connection-webservice-caches`. */
function follow(id: string, moves: readonly { end: string; from: string[]; to: string[] }[]): { id: string; ends: string[] } {
  const head = id.startsWith(`${WORDS['connections']}-`) ? `${WORDS['connections']}-` : '';
  const groups = id.slice(head.length).split('-');
  const longest = [...moves].sort((a, b) => b.from.length - a.from.length);
  const out: string[] = [];
  const ends: string[] = [];
  for (let at = 0; at < groups.length; ) {
    const hit = longest.find((move) => move.from.every((group, index) => groups[at + index] === group));
    if (hit === undefined) {
      out.push(groups[at] as string);
      at++;
      continue;
    }
    out.push(...hit.to);
    if (!ends.includes(hit.end)) ends.push(hit.end);
    at += hit.from.length;
  }
  return { id: head + out.join('-'), ends };
}

/**
 * The values of a record that name records, as the check reads them: the fields of `FIELDS` for
 * its folder, on each step of a flow too, and of a rule the ids `ruleReferences` finds. `map` is
 * the record: a file's top, or what a change adds or updates. A bare word in `steps` names a step.
 */
function spotsOf(doc: Document, folder: string, map: YAMLMap): { node: Scalar; kinds: readonly string[] }[] {
  const spots: { node: Scalar; kinds: readonly string[] }[] = [];
  const take = (node: unknown, kinds: readonly string[]) => {
    if (isScalar(node) && typeof node.value === 'string') spots.push({ node, kinds });
    else if (isSeq(node)) for (const item of node.items) if (isScalar(item) && typeof item.value === 'string') spots.push({ node: item, kinds });
  };
  for (const spec of FIELDS) {
    if (spec.folder !== folder) continue;
    if (!spec.step) take(map.get(spec.field, true), spec.kinds);
    else {
      const steps = map.get('steps', true);
      if (isSeq(steps)) for (const step of steps.items) if (isMap(step)) take(step.get(spec.field, true), spec.kinds);
    }
  }
  if (folder === 'rules') {
    // A rule the check could not read may hold anything; what cannot be walked names nothing here either.
    let found: ReturnType<typeof ruleReferences> = [];
    try {
      found = ruleReferences({ fields: map.toJS(doc) as Record<string, unknown> } as Entry);
    } catch {
      found = [];
    }
    for (const reference of found) {
      const node = map.getIn(reference.key, true);
      const index = /\[(\d+)\]$/.exec(reference.path)?.[1];
      take(isSeq(node) && index !== undefined ? node.items[Number(index)] : node, reference.kinds);
    }
  }
  return spots;
}

/** The line of an offset in a text, from 1. */
function lineAt(text: string, offset: number): number {
  let line = 1;
  for (let at = text.indexOf('\n'); at >= 0 && at < offset; at = text.indexOf('\n', at + 1)) line++;
  return line;
}
