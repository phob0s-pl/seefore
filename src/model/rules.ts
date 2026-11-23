import type { Count, Found, Place, Problem } from './answer.ts';
import { NOUNS } from './kinds.ts';
import { buildModel, listOf, textOf } from './model.ts';
import type { Entry, Model } from './model.ts';
import { START, list, quote } from './problem.ts';

/**
 * The rules across the records. Each is a pure function of the model. A check names a record
 * and a field; `place` turns that into a file, a line and a column.
 */

/** A record and a field, where a field may be a path such as `via[1]`. */
export type At = { entry: Entry; field?: string };

export type Finding = At & {
  message: string;
  fix: string;
  /** The second place, where two records clash. */
  second?: At;
};

export type Rule = {
  id: string;
  gives: 'error' | 'warning' | 'count';
  /** The one sentence that says what must be true. */
  says: string;
  /** The folders a count looks at, to say how many records it checked. */
  looksAt?: readonly string[];
  check(model: Model): Finding[];
};

/** The place of a record and field in its file; the start of the file when the field is not placed. */
export function place({ entry, field }: At): Place {
  const at = (field !== undefined ? entry.at.get(field) : undefined) ?? START;
  return { file: entry.file, line: at.line, column: at.column, record: entry.id, ...(field !== undefined ? { field: field.replace(/\[\d+\]$/, '') } : {}) };
}

/** A finding as a place, a message and a fix. */
export function found(finding: Finding): Found {
  return { ...place(finding), message: finding.message, fix: finding.fix, ...(finding.second ? { second: place(finding.second) } : {}) };
}

/** A finding as a problem of a rule. */
export function problemOf(rule: Rule, finding: Finding): Problem {
  return { ...found(finding), rule: rule.id, severity: rule.gives === 'warning' ? 'warning' : 'error' };
}

const named = (entries: readonly Entry[]) => list(entries.map((entry) => entry.file));

// ---- references: what each field may name, and what to say when it names the wrong thing

type Field = { folder: string; field: string; kinds: readonly string[]; many?: true };

const ENDS = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];
const PARTS = ['systems', 'apps', 'stores', 'components', 'infrastructure'];
const NEEDS_OWNER_OR_TECH = ['apps', 'stores', 'components', 'infrastructure'];

const FIELDS: Field[] = [
  { folder: 'apps', field: 'in', kinds: ['systems'] },
  { folder: 'stores', field: 'in', kinds: ['systems', 'apps'] },
  { folder: 'components', field: 'in', kinds: ['apps'] },
  { folder: 'infrastructure', field: 'in', kinds: ['systems'] },
  { folder: 'connections', field: 'from', kinds: ENDS },
  { folder: 'connections', field: 'to', kinds: ENDS },
  { folder: 'connections', field: 'via', kinds: ['infrastructure', 'apps', 'components', 'systems'], many: true },
  ...['systems', ...NEEDS_OWNER_OR_TECH].map((folder) => ({ folder, field: 'owner', kinds: ['owners'] })),
  ...[...NEEDS_OWNER_OR_TECH, 'connections'].map((folder) => ({ folder, field: 'technology', kinds: ['technologies'], many: true as const })),
];

/** What a field may name, in words: "a person, a system or an app". */
function allowed(kinds: readonly string[]): string {
  const nouns = kinds.map((kind) => NOUNS[kind] as string);
  return nouns.length === 1 ? (nouns[0] as string) : `${nouns.slice(0, -1).join(', ')} or ${nouns[nouns.length - 1]}`;
}

/** A case of a field that names the wrong kind: what is said, and how to mend it. */
type Wrong = { field: string; folder?: string; found: readonly string[]; says: string; fix: string };

const WRONG: Wrong[] = [
  {
    field: 'in',
    folder: 'stores',
    found: ['stores'],
    says: 'A store is never in a store.',
    fix: 'Put both stores in the system. Name the server, or the table that holds the queue, in the description.',
  },
  {
    field: 'in',
    folder: 'apps',
    found: ['apps'],
    says: 'An app is in a system, not in another app.',
    fix: 'If it runs only inside the host, write it as a component of the host. If it runs on its own, put both apps in the system.',
  },
  {
    field: 'in',
    folder: 'components',
    found: ['stores', 'systems'],
    says: 'A component is in an app.',
    fix: "A component is in an app. For our code inside somebody else's software, write that app inside the outside system and put the component in it. For code inside a database, say it in the store's description.",
  },
  {
    field: 'via',
    found: ['stores'],
    says: 'A store is not passed through.',
    fix: 'A store is not passed through. Write one connection to it from each side.',
  },
  {
    field: 'via',
    found: ['owners', 'technologies', 'connections', 'people', 'stores'],
    says: '`via` names what the exchange passes through: a piece of infrastructure, an app, a component or a system.',
    fix: 'Take it out of `via`, or name a piece of infrastructure, an app, a component or a system that the exchange passes through. Say anything more in the description.',
  },
  {
    field: 'from',
    found: ['owners', 'technologies', 'connections'],
    says: 'An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    fix: 'Name the one that acts, which is a person, a system, an app, a store, a component or a piece of infrastructure. An owner or a technology is named in `owner` or `technology` of a part instead.',
  },
  {
    field: 'to',
    found: ['owners', 'technologies', 'connections'],
    says: 'An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    fix: 'Name the one it acts on, which is a person, a system, an app, a store, a component or a piece of infrastructure. An owner or a technology is named in `owner` or `technology` of a part instead.',
  },
  {
    field: 'owner',
    found: ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'technologies'],
    says: '`owner` names an owner, a record in `owners/`.',
    fix: 'Write `owners/<id>.yaml` with a `name` for the team, and name that id in `owner`. If a record of another kind has the id you want, keep both and name the owner for what it is for.',
  },
  {
    field: 'technology',
    found: ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners'],
    says: '`technology` names technologies, records in `technologies/`.',
    fix: 'Write `technologies/<id>.yaml` with a `name`, and name that id in `technology`. If a record of another kind has the id you want, keep both and keep the product\'s name for the technology.',
  },
];

function wrongCase(field: Field, kind: string): Wrong | undefined {
  return WRONG.find((wrong) => wrong.field === field.field && (wrong.folder === undefined || wrong.folder === field.folder) && wrong.found.includes(kind));
}

/** The nearest of the ids when one is at most two edits away. */
function nearest(id: string, ids: readonly string[]): string | undefined {
  let best: string | undefined;
  let bestDistance = 3;
  for (const other of ids) {
    const distance = edits(id, other);
    if (distance < bestDistance) [best, bestDistance] = [other, distance];
  }
  return best;
}

function edits(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let row = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const next = [i];
    for (let j = 1; j <= b.length; j++) {
      next[j] = Math.min((row[j] as number) + 1, (next[j - 1] as number) + 1, (row[j - 1] as number) + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    row = next;
  }
  return row[b.length] as number;
}

/** Every id that a good record names, with where. */
function references(model: Model): { entry: Entry; spec: Field; id: string; path: string }[] {
  const all: { entry: Entry; spec: Field; id: string; path: string }[] = [];
  for (const entry of model.entries) {
    if (!entry.ok) continue;
    for (const spec of FIELDS) {
      if (spec.folder !== entry.kind) continue;
      if (spec.many) listOf(entry, spec.field).forEach((id, index) => all.push({ entry, spec, id, path: `${spec.field}[${index}]` }));
      else {
        const id = textOf(entry, spec.field);
        if (id !== undefined) all.push({ entry, spec, id, path: spec.field });
      }
    }
  }
  return all;
}

// ---- the rules

const idTwice: Rule = {
  id: 'id-twice',
  gives: 'error',
  says: 'An id names one record in the whole model, whatever its folder.',
  check(model) {
    const findings: Finding[] = [];
    const seen = new Set<string>();
    for (const entry of model.entries) {
      const same = model.claims(entry.id);
      if (same.length < 2 || seen.has(entry.id)) continue;
      seen.add(entry.id);
      const [first, second] = same as [Entry, Entry];
      findings.push({
        entry: first,
        second: { entry: second },
        message: `${quote(entry.id)} is the id of ${same.length} records: ${named(same)}. An id names one record in the whole model, whatever its folder.`,
        fix: "Keep both records. Name the part for what it is for, and keep the product's name for the technology. Rename one file, and change every `in`, `from`, `to`, `via`, `owner` and `technology` that names it.",
      });
    }
    return findings;
  },
};

const referenceUnknown: Rule = {
  id: 'reference-unknown',
  gives: 'error',
  says: 'Each id in `in`, `from`, `to`, `owner`, `technology` and `via` names a record.',
  check(model) {
    const findings: Finding[] = [];
    for (const { entry, spec, id, path } of references(model)) {
      if (model.claims(id).length > 0) continue;
      const close = nearest(
        id,
        model.entries.filter((other) => spec.kinds.includes(other.kind)).map((other) => other.id),
      );
      const folder = spec.kinds[0] as string;
      findings.push({
        entry,
        field: path,
        message: `\`${spec.field}\` names ${quote(id)}, but no record has that id.${close ? ` The nearest id is ${quote(close)}.` : ''}`,
        fix: close
          ? `If ${quote(close)} was meant, write it instead of ${quote(id)}. Otherwise write \`${folder}/${id}.yaml\` with a \`name\`.`
          : `No record has the id ${quote(id)}. Write \`${folder}/${id}.yaml\` with a \`name\`, or use an id that exists. \`${spec.field}\` names ${allowed(spec.kinds)}.`,
      });
    }
    return findings;
  },
};

const referenceWrongKind: Rule = {
  id: 'reference-wrong-kind',
  gives: 'error',
  says: 'Each reference names a record of a kind its field allows: an app is in a system, a component in an app, a store in a system or an app.',
  check(model) {
    const findings: Finding[] = [];
    for (const { entry, spec, id, path } of references(model)) {
      const target = model.record(id);
      if (!target || spec.kinds.includes(target.kind)) continue;
      const case_ = wrongCase(spec, target.kind);
      const rule = case_?.says ?? `\`${spec.field}\` names ${allowed(spec.kinds)}.`;
      findings.push({
        entry,
        field: path,
        message: `\`${spec.field}\` names ${quote(id)}, which is ${NOUNS[target.kind]}. ${rule}`,
        fix: case_?.fix ?? `Name ${allowed(spec.kinds)} in \`${spec.field}\`, or write the record that is missing.`,
      });
    }
    return findings;
  },
};

const accessNotStore: Rule = {
  id: 'access-not-store',
  gives: 'error',
  says: '`access` stands only where `to` is a store.',
  check(model) {
    const findings: Finding[] = [];
    for (const entry of model.entries) {
      if (!entry.ok || entry.kind !== 'connections' || entry.fields['access'] === undefined) continue;
      const to = textOf(entry, 'to') as string;
      const kind = model.kindOf(to);
      if (kind === undefined || kind === 'stores') continue;
      findings.push({
        entry,
        field: 'access',
        message: `\`access\` says what a connection does to a store, and this connection ends at ${quote(to)}, which is ${NOUNS[kind]}.`,
        fix: 'If the far end holds the data, write that as a store in its system and end the connection there. If it is an API, say the read or write in the name, and take `access` out.',
      });
    }
    return findings;
  },
};

const viaEnd: Rule = {
  id: 'via-end',
  gives: 'warning',
  says: 'No hop in `via` is itself an end of its connection. A hop may be in an end or hold one.',
  check(model) {
    const findings: Finding[] = [];
    for (const entry of model.entries) {
      if (!entry.ok || entry.kind !== 'connections') continue;
      const from = textOf(entry, 'from');
      const to = textOf(entry, 'to');
      listOf(entry, 'via').forEach((hop, index) => {
        if (hop !== from && hop !== to) return;
        const end = hop === from ? 'from' : 'to';
        findings.push({
          entry,
          field: `via[${index}]`,
          message: `${quote(hop)} is in \`via\`, and it is also the \`${end}\` of this connection. A connection does not pass through its own end.`,
          fix: `Take ${quote(hop)} out of \`via\`. If another copy passes it on, say which copy in the name.`,
        });
      });
    }
    return findings;
  },
};

const connectionTwice: Rule = {
  id: 'connection-twice',
  gives: 'warning',
  says: 'No two named connections agree in every field.',
  check(model) {
    const groups = new Map<string, Entry[]>();
    for (const entry of model.entries) {
      if (!entry.ok || entry.kind !== 'connections' || entry.fields['name'] === undefined) continue;
      const f = entry.fields;
      const key = JSON.stringify([f['from'], f['to'], f['name'], listOf(entry, 'via'), f['only'], f['access'], f['opens'], [...listOf(entry, 'technology')].sort(), f['description']]);
      groups.set(key, [...(groups.get(key) ?? []), entry]);
    }
    const findings: Finding[] = [];
    for (const same of groups.values()) {
      if (same.length < 2) continue;
      const [first, second] = same as [Entry, Entry];
      findings.push({
        entry: first,
        second: { entry: second },
        message: `${same.length} connections say the same: ${named(same)}. They agree in \`from\`, \`to\`, \`name\`, \`via\` and every other field.`,
        fix: 'If they are one exchange, keep one. If they are two, tell them apart by name, `via` or `only`.',
      });
    }
    return findings;
  },
};

const recordUnused: Rule = {
  id: 'record-unused',
  gives: 'count',
  says: 'Some record names each owner and each technology.',
  looksAt: ['owners', 'technologies'],
  check(model) {
    const named = new Set<string>();
    for (const entry of model.entries) {
      if (entry.fields['owner'] !== undefined) named.add(textOf(entry, 'owner') as string);
      for (const id of listOf(entry, 'technology')) named.add(id);
    }
    return model.entries
      .filter((entry) => (entry.kind === 'owners' || entry.kind === 'technologies') && !named.has(entry.id))
      .map((entry) => ({
        entry,
        message: `Nothing names ${quote(entry.id)}.`,
        fix: `Nothing names ${quote(entry.id)}. Keep it if it is listed on purpose; else remove its file.`,
      }));
  },
};

/** All the rules, in the order they are listed. */
export const RULES: readonly Rule[] = [idTwice, referenceUnknown, referenceWrongKind, accessNotStore, viaEnd, connectionTwice, recordUnused];

/** Runs the rules over the entries. Counts are given only when `whole`: every file read. */
export function runRules(entries: readonly Entry[], whole: boolean, run: boolean): { problems: Problem[]; counts: Count[] } {
  const model = buildModel(entries);
  const problems: Problem[] = [];
  const counts: Count[] = [];
  for (const rule of RULES) {
    if (rule.gives === 'count') {
      const counted = run && whole;
      counts.push({
        rule: rule.id,
        says: rule.says,
        checked: counted ? entries.filter((entry) => rule.looksAt?.includes(entry.kind)).length : null,
        found: counted ? rule.check(model).map(found) : [],
      });
    } else if (run) {
      problems.push(...rule.check(model).map((finding) => problemOf(rule, finding)));
    }
  }
  return { problems, counts };
}
