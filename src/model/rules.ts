import type { Count, Found, Place, Problem, Ruling } from './answer.ts';
import { judgeRules, ruleReferences, ruleShape } from './judge.ts';
import { NOUNS } from './kinds.ts';
import { buildModel, listOf, stepsOf, textOf } from './model.ts';
import type { Entry, Model } from './model.ts';
import { START, capital, list, quote } from './problem.ts';
import { CONTEXT_MAX } from './records.ts';
import { dotted, label } from './shape.ts';

/**
 * The rules across the records. Each is a pure function of the model. A check names a record
 * and a field; `place` turns that into a file, a line and a column.
 */

/** A record and a field, where a field may be a path such as `via[1]` or `steps[2].does`. */
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

/** The place of a record and field in its file; the start of the file when the field is not placed. The field named is its top key, as `via` or `steps`. */
export function place({ entry, field }: At): Place {
  const at = (field !== undefined ? entry.at.get(field) : undefined) ?? START;
  return { file: entry.file, line: at.line, column: at.column, record: entry.id, ...(field !== undefined ? { field: field.replace(/[[.].*$/, '') } : {}) };
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

/** A field that names records: on a record of `folder`, or on each step of a flow when `step`. `ways`: in a rule of ways. */
type Field = { folder: string; field: string; kinds: readonly string[]; many?: true; step?: true; ways?: boolean };

const ENDS = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];
const PARTS = ['systems', 'apps', 'stores', 'components', 'infrastructure'];
const NEEDS_OWNER_OR_TECH = ['apps', 'stores', 'components', 'infrastructure'];
/** The kinds that are not parts or connections: what `touches`, `from` and `to` never name. */
const NOT_THINGS = ['owners', 'technologies', 'features', 'flows', 'data', 'rules', 'context', 'changes', 'reviews'];

const FIELDS: Field[] = [
  { folder: 'apps', field: 'in', kinds: ['systems'] },
  { folder: 'stores', field: 'in', kinds: ['systems', 'apps'] },
  { folder: 'components', field: 'in', kinds: ['apps'] },
  { folder: 'infrastructure', field: 'in', kinds: ['systems'] },
  { folder: 'connections', field: 'from', kinds: ENDS },
  { folder: 'connections', field: 'to', kinds: ENDS },
  { folder: 'connections', field: 'via', kinds: ['infrastructure', 'apps', 'components', 'systems'], many: true },
  ...['systems', ...NEEDS_OWNER_OR_TECH, 'features'].map((folder) => ({ folder, field: 'owner', kinds: ['owners'] })),
  ...[...NEEDS_OWNER_OR_TECH, 'connections'].map((folder) => ({ folder, field: 'technology', kinds: ['technologies'], many: true as const })),
  { folder: 'features', field: 'touches', kinds: [...ENDS, 'connections'], many: true },
  { folder: 'flows', field: 'feature', kinds: ['features'] },
  { folder: 'flows', field: 'does', kinds: ['connections', ...ENDS, 'flows'], step: true },
  { folder: 'flows', field: 'data', kinds: ['data'], many: true, step: true },
  { folder: 'context', field: 'system', kinds: ['systems'] },
];

/** What a field may name, in words: "a person, a system or an app". */
function allowed(kinds: readonly string[]): string {
  const nouns = kinds.map((kind) => NOUNS[kind] as string);
  return nouns.length === 1 ? (nouns[0] as string) : `${nouns.slice(0, -1).join(', ')} or ${nouns[nouns.length - 1]}`;
}

/** A case of a field that names the wrong kind: what is said, and how to mend it. */
type Wrong = { field: string; folder?: string; ways?: boolean; found: readonly string[]; says: string; fix: string };

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
    fix: "For our code inside somebody else's software, write that app inside the outside system and put the component in it. For code inside a database, say it in the store's description.",
  },
  {
    field: 'via',
    found: ['stores'],
    says: 'A store is not passed through.',
    fix: 'Write one connection to the store from each side, and take it out of `via`.',
  },
  {
    field: 'via',
    found: ['owners', 'technologies', 'connections', 'people', 'stores', 'features', 'flows', 'data', 'rules', 'context', 'changes', 'reviews'],
    says: '`via` names what the exchange passes through: a piece of infrastructure, an app, a component or a system.',
    fix: 'Take it out of `via`, or name a piece of infrastructure, an app, a component or a system that the exchange passes through. Say anything more in the description.',
  },
  {
    field: 'from',
    found: ['connections', ...NOT_THINGS],
    says: 'An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    fix: 'Name the one that acts, which is a person, a system, an app, a store, a component or a piece of infrastructure. An owner or a technology is named in `owner` or `technology` of a part instead.',
  },
  {
    field: 'to',
    found: ['connections', ...NOT_THINGS],
    says: 'An end of a connection is a person, a system, an app, a store, a component or a piece of infrastructure.',
    fix: 'Name the one it acts on, which is a person, a system, an app, a store, a component or a piece of infrastructure. An owner or a technology is named in `owner` or `technology` of a part instead.',
  },
  {
    field: 'owner',
    found: ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'technologies', 'features', 'flows', 'data', 'rules', 'context', 'changes', 'reviews'],
    says: '`owner` names an owner, a record in `owners/`.',
    fix: 'Write `owners/<id>.yaml` with a `name` for the team, and name that id in `owner`. If a record of another kind has the id you want, keep both and name the owner for what it is for.',
  },
  {
    field: 'technology',
    found: ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners', 'features', 'flows', 'data', 'rules', 'context', 'changes', 'reviews'],
    says: '`technology` names technologies, records in `technologies/`.',
    fix: 'Write `technologies/<id>.yaml` with a `name`, and name that id in `technology`. If a record of another kind has the id you want, keep both and keep the product\'s name for the technology.',
  },
  {
    field: 'touches',
    found: ['owners'],
    says: '`touches` names the parts and connections that are the feature\'s own.',
    fix: 'Name the owner in the feature\'s `owner`, and take it out of `touches`.',
  },
  {
    field: 'touches',
    found: ['flows'],
    says: '`touches` names the parts and connections that are the feature\'s own.',
    fix: 'A flow names its feature in its own `feature`. Take the flow out of `touches`, and name this feature in the flow.',
  },
  {
    field: 'touches',
    found: ['data'],
    says: '`touches` names the parts and connections that are the feature\'s own.',
    fix: 'A feature shows the data of its flows. Take it out of `touches`, and name it in `data` of the steps that pass it.',
  },
  {
    field: 'touches',
    found: ['technologies'],
    says: '`touches` names the parts and connections that are the feature\'s own.',
    fix: 'Take it out of `touches`. A technology is named in `technology` of the part that is built with it.',
  },
  {
    field: 'touches',
    found: ['features'],
    says: '`touches` names the parts and connections that are the feature\'s own.',
    fix: 'Take it out of `touches`. A feature is in no other feature, and names none: say in its `description` how the two belong together.',
  },
  {
    field: 'feature',
    found: [...ENDS, 'connections', ...NOT_THINGS.filter((kind) => kind !== 'features')],
    says: 'A flow names the one feature it belongs to, a record in `features/`.',
    fix: 'Name the feature in `feature`. If it has no record yet, write `features/<id>.yaml` with the `name` its users say.',
  },
  {
    field: 'does',
    found: ['features'],
    says: 'A step does not happen on a feature.',
    fix: "A step is on a connection, a part or another flow. Name the feature in the flow's `feature`.",
  },
  {
    field: 'does',
    found: ['data'],
    says: 'Data is what a step passes, not where it happens.',
    fix: 'Name the connection the data travels on in `does`, and the data in `data`.',
  },
  {
    field: 'does',
    found: ['owners', 'technologies'],
    says: 'A step happens on a connection, in a part or as a whole flow.',
    fix: 'Name in `does` the connection, part or flow the step happens on. An owner or a technology is named on a part instead.',
  },
  {
    field: 'data',
    found: [...ENDS, 'connections', ...NOT_THINGS.filter((kind) => kind !== 'data')],
    says: '`data` names what the step passes, records in `data/`.',
    fix: 'Write `data/<id>.yaml` with a `name` for what passes, and name that id in `data`. The connection or the part goes in `does`.',
  },
  {
    field: 'data',
    folder: 'rules',
    found: [...ENDS, 'connections', ...NOT_THINGS.filter((kind) => kind !== 'data')],
    says: '`data` of a selector names data that a step of a flow passes, records in `data/`.',
    fix: 'Name in `data` the data records that the steps pass, or `any` or `none`.',
  },
  {
    field: 'id',
    folder: 'rules',
    found: ['rules'],
    says: 'A rule chooses among the records of the other twelve folders, and never a rule.',
    fix: 'Name a record of the model in `id`. To judge two rules together, write each in its own file.',
  },
  {
    field: 'debt',
    folder: 'rules',
    found: ['rules'],
    says: '`debt` names the records that break the rule and stand for now.',
    fix: 'Take the rule out of `debt`, and name there the records that break this rule.',
  },
  {
    field: 'debt',
    folder: 'rules',
    ways: true,
    found: [...ENDS, ...NOT_THINGS],
    says: 'Of a rule of ways, `debt` names connections: a way does not go by one.',
    fix: 'Name in `debt` a connection of the way that stands for now, and take the rest out.',
  },
];

function wrongCase(field: Field, kind: string): Wrong | undefined {
  return WRONG.find(
    (wrong) => wrong.field === field.field && (wrong.folder === undefined || wrong.folder === field.folder) && (wrong.ways ?? false) === (field.ways ?? false) && wrong.found.includes(kind),
  );
}

/** The nearest of the ids when one is at most two edits away. */
export function nearest(id: string, ids: readonly string[]): string | undefined {
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

/** An id that a good record names: where it is, as `steps[2].does`, and the field in words, as "`does` of the third step". */
type Reference = { entry: Entry; spec: Field; id: string; path: string; words: string };

/** Every id that a good record names, with where. */
function references(model: Model): Reference[] {
  const all: Reference[] = [];
  for (const entry of model.entries) {
    if (!entry.ok) continue;
    for (const spec of FIELDS) {
      if (spec.folder !== entry.kind) continue;
      const holders = spec.step ? stepsOf(entry).map((step) => ({ fields: step.fields, at: ['steps', step.index] })) : [{ fields: entry.fields, at: [] }];
      for (const { fields, at } of holders) {
        const where = [...at, spec.field];
        const words = label(where);
        const value = fields[spec.field];
        if (spec.many && Array.isArray(value)) value.forEach((id, index) => typeof id === 'string' && all.push({ entry, spec, id, path: dotted([...where, index]), words }));
        else if (!spec.many && typeof value === 'string') all.push({ entry, spec, id: value, path: dotted(where), words });
      }
    }
    // A rule names ids anywhere in its selectors, and in `debt`.
    if (entry.kind === 'rules')
      for (const named of ruleReferences(entry))
        all.push({ entry, spec: { folder: 'rules', field: named.field, kinds: named.kinds, ways: named.ways }, id: named.id, path: named.path, words: label(named.key) });
  }
  return all;
}

/** The good flows, by id. */
const flowsOf = (model: Model): Entry[] => model.entries.filter((entry) => entry.ok && entry.kind === 'flows').sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** A step in words: "the third step". */
const stepWords = (index: number): string => label(['steps', index]);

/** Words joined as people join them: "a", "a and b", "a, b and c". */
const joined = (words: readonly string[]): string => (words.length <= 1 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

/**
 * What a step's `does` names, when that is sure: a connection, a part or a flow. Nothing when it
 * names nothing, an id that two files claim, or a kind it may not name: those are problems of
 * their own, and the checks that need to know what it names say nothing.
 */
function onWhat(model: Model, does: string | undefined): { on: 'connection' | 'part' | 'flow'; entry: Entry } | undefined {
  const entry = does === undefined ? undefined : model.record(does);
  if (entry === undefined) return undefined;
  if (entry.kind === 'connections') return { on: 'connection', entry };
  if (entry.kind === 'flows') return { on: 'flow', entry };
  return ENDS.includes(entry.kind) ? { on: 'part', entry } : undefined;
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
      const kinds = same.map((each) => each.kind);
      const how = kinds.includes('features')
        ? 'Give the feature the word its users say, as `sales-reporting` where the component is `sales-reports`.'
        : kinds.includes('data')
          ? 'Give the data a second word, as `ticket-scan` where an app is `scan`.'
          : kinds.includes('flows')
            ? 'Name the flow for its task, as `placing-an-order` where a store is `orders`.'
            : "Name the part for what it is for, and keep the product's name for the technology.";
      findings.push({
        entry: first,
        second: { entry: second },
        message: `${quote(entry.id)} is the id of ${same.length} records: ${named(same)}. An id names one record in the whole model, whatever its folder.`,
        fix: `Keep both records. ${how} Rename one file, and change every field that names it.`,
      });
    }
    return findings;
  },
};

const referenceUnknown: Rule = {
  id: 'reference-unknown',
  gives: 'error',
  says: "Each id in `in`, `from`, `to`, `owner`, `technology`, `via`, `touches` and `feature`, in a step's `does` and `data`, in a rule of a team's own, and in `system` of a line of context, names a record.",
  check(model) {
    const findings: Finding[] = [];
    for (const { entry, spec, id, path, words } of references(model)) {
      if (model.claims(id).length > 0) continue;
      const close = nearest(
        id,
        model.entries.filter((other) => spec.kinds.includes(other.kind)).map((other) => other.id),
      );
      // Where the missing record would go: its folder when the field allows one kind only.
      const write =
        spec.kinds.length === 1
          ? `write \`${spec.kinds[0]}/${id}.yaml\` with a \`name\``
          : `write the record for ${quote(id)} in the folder of its kind`;
      findings.push({
        entry,
        field: path,
        message: `${capital(words)} names ${quote(id)}, but no record has that id.${close ? ` The nearest id is ${quote(close)}.` : ''}`,
        fix: close
          ? `If ${quote(close)} was meant, write it instead of ${quote(id)}. Otherwise ${write}.`
          : `Use an id that exists, or ${write}. \`${spec.field}\` names ${allowed(spec.kinds)}.`,
      });
    }
    return findings;
  },
};

const referenceWrongKind: Rule = {
  id: 'reference-wrong-kind',
  gives: 'error',
  says: "Each reference names a record of a kind its field allows: an app is in a system, a component in an app, a store in a system or an app; a step's `does` names a connection, a part or a flow.",
  check(model) {
    const findings: Finding[] = [];
    for (const { entry, spec, id, path, words } of references(model)) {
      const target = model.record(id);
      if (!target || spec.kinds.includes(target.kind)) continue;
      const case_ = wrongCase(spec, target.kind);
      const rule = case_?.says ?? `\`${spec.field}\` names ${allowed(spec.kinds)}.`;
      findings.push({
        entry,
        field: path,
        message: `${capital(words)} names ${quote(id)}, which is ${NOUNS[target.kind]}. ${rule}`,
        fix: case_?.fix ?? `Name ${allowed(spec.kinds)} in \`${spec.field}\`, or write the record that is missing.`,
      });
    }
    return findings;
  },
};

const contextMany: Rule = {
  id: 'context-many',
  gives: 'warning',
  says: 'At most twelve lines of context are global, and at most twelve are about one system.',
  check(model) {
    // Each group in the order of its ids: the lines that name no system, and those that name each one.
    const groups = new Map<string, Entry[]>();
    for (const entry of model.entries) {
      if (!entry.ok || entry.kind !== 'context') continue;
      const about = textOf(entry, 'system') ?? '';
      groups.set(about, [...(groups.get(about) ?? []), entry]);
    }
    const findings: Finding[] = [];
    for (const [about, lines] of groups) {
      const thirteenth = [...lines].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[CONTEXT_MAX];
      if (thirteenth === undefined) continue;
      const which = about === '' ? 'are global' : `are about ${quote(about)}`;
      findings.push({
        entry: thirteenth,
        message: `${lines.length} lines of context ${which}. Keep to ${CONTEXT_MAX}: a dozen sentences are read, a handbook is not.`,
        fix: 'Keep the lines that a design could break, and take out those that only describe. Join two that say one thing.',
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

const stepTwice: Rule = {
  id: 'step-twice',
  gives: 'error',
  says: "A step's id is used once in its flow.",
  check(model) {
    const findings: Finding[] = [];
    for (const entry of flowsOf(model)) {
      const places = new Map<string, number[]>();
      for (const step of stepsOf(entry)) places.set(step.id, [...(places.get(step.id) ?? []), step.index]);
      for (const [id, indices] of places) {
        if (indices.length < 2) continue;
        const [first, second] = indices as [number, number];
        findings.push({
          entry,
          field: `steps[${second}].id`,
          second: { entry, field: `steps[${first}].id` },
          message: `${quote(id)} is the id of ${joined(indices.map(stepWords))}. A step's id is used once in its flow.`,
          fix: 'Give each step an id of its own, and change every `reply` and `after` that names it.',
        });
      }
    }
    return findings;
  },
};

const stepShape: Rule = {
  id: 'step-shape',
  gives: 'error',
  says: 'A step has not both `does` and `reply`; it has a `name` unless `does` names a flow or a connection with a name; and `data` stands only on a step on a connection, or on a reply.',
  check(model) {
    const findings: Finding[] = [];
    for (const entry of flowsOf(model)) {
      for (const step of stepsOf(entry)) {
        const which = stepWords(step.index);
        const at = `steps[${step.index}]`;
        if (step.does !== undefined && step.reply !== undefined) {
          findings.push({
            entry,
            field: `${at}.reply`,
            message: `${capital(which)} has both \`does\` and \`reply\`. A step either happens on a connection, a part or a flow, or is the answer to an earlier step.`,
            fix: 'Keep one of the two. If the step acts and an answer comes back, write the answer as a step of its own below it, with `reply`.',
          });
          continue;
        }
        const found = onWhat(model, step.does);
        const target = found === undefined ? '' : `${quote(found.entry.id)}, which is ${NOUNS[found.entry.kind]}`;
        if (step.name === undefined) {
          const missing = (message: string, fix: string) => findings.push({ entry, field: at, message, fix });
          if (step.reply !== undefined) missing(`${capital(which)} is a reply and has no \`name\`.`, 'Write a `name` that says what comes back, as in `name: The list of valid tickets`.');
          else if (step.does === undefined)
            missing(`${capital(which)} has neither \`does\` nor \`reply\`, and no \`name\`, so nothing says what happens.`, 'Write a `name` that says what happens. Once it is known where, name the connection, part or flow in `does`.');
          else if (found?.on === 'part')
            missing(`${capital(which)} has no \`name\`. It happens at ${target}, and a part's name does not say what happens there.`, 'Write a `name` on the step that says what happens, verb first, as in `name: Decides from the list and the clock`.');
          else if (found?.on === 'connection' && found.entry.ok && found.entry.fields['name'] === undefined)
            missing(`${capital(which)} has no \`name\`, and the connection ${quote(found.entry.id)} it is on has none to lend it.`, 'Write a `name` on the step that says what happens, verb first, or give the connection a `name`.');
        }
        if (step.data.length > 0 && step.reply === undefined) {
          const misplaced = (where: string, fix: string) => findings.push({ entry, field: `${at}.data`, message: `${capital(which)} has \`data\`, but ${where}`, fix });
          const travels = 'Data stands where something travels: on a step on a connection, or on a reply.';
          if (step.does === undefined) misplaced('neither `does` nor `reply`: nothing says where the data travels.', 'Name the connection the data travels on in `does`, or take `data` off until that is known.');
          else if (found?.on === 'part') misplaced(`it happens at ${target}. ${travels}`, 'Take `data` off this step, and name the data on the step whose connection carries it.');
          else if (found?.on === 'flow') misplaced(`it runs the flow ${quote(found.entry.id)}. ${travels}`, `Take \`data\` off this step, and name the data on the steps of ${quote(found.entry.id)} that pass it.`);
        }
      }
    }
    return findings;
  },
};

const stepEarlier: Rule = {
  id: 'step-earlier',
  gives: 'error',
  says: '`reply` and `after` name earlier steps of the same flow, and `reply` one on a connection that does not end at a store.',
  check(model) {
    const findings: Finding[] = [];
    for (const entry of flowsOf(model)) {
      const steps = stepsOf(entry);
      // Where each id stands. An id used twice is a problem of `step-twice`, and is not looked at again.
      const first = new Map<string, number>();
      const twice = new Set<string>();
      for (const step of steps) {
        if (first.has(step.id)) twice.add(step.id);
        else first.set(step.id, step.index);
      }
      for (const step of steps) {
        const named = [
          ...(step.reply !== undefined ? [{ id: step.reply, path: ['steps', step.index, 'reply'], key: 'reply' }] : []),
          ...step.after.map((id, index) => ({ id, path: ['steps', step.index, 'after', index], key: 'after' })),
        ];
        for (const { id, path, key } of named) {
          if (twice.has(id)) continue;
          const words = capital(label(key === 'reply' ? path : path.slice(0, -1)));
          const push = (message: string, fix: string) => findings.push({ entry, field: dotted(path), message, fix });
          const at = first.get(id);
          if (at === undefined) {
            const close = nearest(id, [...first.keys()].filter((other) => other !== step.id));
            push(
              `${words} names ${quote(id)}, but no step of this flow has that id.${close ? ` The nearest is ${quote(close)}.` : ''}`,
              key === 'reply' ? 'Name in `reply` the earlier step whose answer this is, by its `id`.' : 'Name in `after` an earlier step of this flow, by its `id`.',
            );
            continue;
          }
          if (at >= step.index) {
            push(
              `${words} names ${quote(id)}, ${at === step.index ? 'its own step' : `${stepWords(at)}, which comes after it`}.`,
              key === 'reply'
                ? 'A reply answers a step above it. Name that step in `reply`, or move this step below the one it answers.'
                : '`after` names steps above this one. Name a step above it, or move this step below the one it comes after.',
            );
            continue;
          }
          if (key !== 'reply') continue;
          const answered = steps[at];
          const fix = 'A reply is the answer that travels back along the connection of an earlier step. Name that step in `reply`.';
          if (answered?.does === undefined) {
            push(`${words} names ${quote(id)}, which ${answered?.reply !== undefined ? 'is a reply itself' : 'has no `does`'}, so no connection carries an answer back.`, fix);
            continue;
          }
          const found = onWhat(model, answered.does);
          if (found === undefined) continue;
          if (found.on === 'part') push(`${words} names ${quote(id)}, which happens at ${quote(found.entry.id)}, ${NOUNS[found.entry.kind]}, and not on a connection.`, fix);
          else if (found.on === 'flow') push(`${words} names ${quote(id)}, which runs the flow ${quote(found.entry.id)}, and not a connection.`, fix);
          else if (found.entry.ok) {
            const to = textOf(found.entry, 'to');
            if (to !== undefined && model.kindOf(to) === 'stores')
              push(
                `${words} names ${quote(id)}, which is on ${quote(found.entry.id)}, a connection to the store ${quote(to)}.`,
                'A read of a store is no reply: the reader acts, along its arrow. Name the connection in `does`.',
              );
          }
        }
      }
    }
    return findings;
  },
};

const flowInItself: Rule = {
  id: 'flow-in-itself',
  gives: 'error',
  says: 'No flow runs itself, through any chain of steps.',
  check(model) {
    // Which flows each flow runs, each by the first step that runs it.
    const flows = flowsOf(model);
    const runs = new Map<string, { flow: string; step: number }[]>();
    for (const entry of flows) {
      const run: { flow: string; step: number }[] = [];
      for (const step of stepsOf(entry)) {
        if (step.does !== undefined && model.record(step.does)?.kind === 'flows' && !run.some((each) => each.flow === step.does)) run.push({ flow: step.does, step: step.index });
      }
      runs.set(entry.id, run);
    }
    // The shortest ring from a flow back to itself, as the flows in order.
    const ringFrom = (start: string): string[] | undefined => {
      const came = new Map<string, string>();
      const queue = [start];
      for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
        for (const { flow } of runs.get(next) ?? []) {
          if (flow === start) {
            const ring = [next];
            while (ring[0] !== start) ring.unshift(came.get(ring[0] as string) as string);
            return ring;
          }
          if (!came.has(flow) && flow !== start) {
            came.set(flow, next);
            queue.push(flow);
          }
        }
      }
      return undefined;
    };
    const told = new Set<string>();
    const findings: Finding[] = [];
    for (const entry of flows) {
      if (told.has(entry.id)) continue;
      const found = ringFrom(entry.id);
      if (found === undefined) continue;
      found.forEach((id) => told.add(id));
      // The ring starts at the flow that comes first by id; the problem is placed at its step.
      const start = found.indexOf([...found].sort()[0] as string);
      const ring = [...found.slice(start), ...found.slice(0, start)];
      const head = model.record(ring[0] as string) as Entry;
      const stepOf = (from: string, to: string) => runs.get(from)?.find((each) => each.flow === to)?.step ?? 0;
      const step = stepOf(head.id, ring[1 % ring.length] as string);
      const last = ring[ring.length - 1] as string;
      findings.push(
        ring.length === 1
          ? {
              entry: head,
              field: `steps[${step}].does`,
              message: `${quote(head.id)} runs itself: \`does\` of ${stepWords(step)} names it. No flow runs itself, through any chain of steps.`,
              fix: 'A flow runs another flow whole, never itself. Take the step out, or say in its `description` what is done again.',
            }
          : {
              entry: head,
              field: `steps[${step}].does`,
              second: { entry: model.record(last) as Entry, field: `steps[${stepOf(last, head.id)}].does` },
              message: `${quote(head.id)} runs ${ring.slice(1).map(quote).join(', which runs ')}, which runs ${quote(head.id)} again. No flow runs itself, through any chain of steps.`,
              fix: 'Break the ring in one of these flows: tell the steps there in place of running the other flow, or take that step out.',
            },
      );
    }
    return findings;
  },
};

const recordUnused: Rule = {
  id: 'record-unused',
  gives: 'count',
  says: 'Some record names each owner and each technology, and some step each data record.',
  looksAt: ['owners', 'technologies', 'data'],
  check(model) {
    const named = new Set<string>();
    for (const entry of model.entries) {
      if (entry.fields['owner'] !== undefined) named.add(textOf(entry, 'owner') as string);
      for (const id of listOf(entry, 'technology')) named.add(id);
      for (const step of stepsOf(entry)) for (const id of step.data) named.add(id);
    }
    return model.entries
      .filter((entry) => (entry.kind === 'owners' || entry.kind === 'technologies' || entry.kind === 'data') && !named.has(entry.id))
      .map((entry) =>
        entry.kind === 'data'
          ? { entry, message: `No step names ${quote(entry.id)}.`, fix: `No step names ${quote(entry.id)}. Name it in \`data\` of the steps that pass it; else remove its file.` }
          : { entry, message: `Nothing names ${quote(entry.id)}.`, fix: `Nothing names ${quote(entry.id)}. Keep it if it is listed on purpose; else remove its file.` },
      );
  },
};

const featureAlone: Rule = {
  id: 'feature-alone',
  gives: 'count',
  says: 'Some flow names each feature, or it touches something.',
  looksAt: ['features'],
  check(model) {
    const named = new Set(flowsOf(model).map((flow) => textOf(flow, 'feature')));
    return model.entries
      .filter((entry) => entry.kind === 'features' && !named.has(entry.id) && listOf(entry, 'touches').length === 0)
      .map((entry) => ({ entry, message: `No flow names ${quote(entry.id)}, and it touches nothing.`, fix: 'Name it on a flow, or say in `touches` which parts are its own.' }));
  },
};

const stepUnplaced: Rule = {
  id: 'step-unplaced',
  gives: 'count',
  says: 'Each step has `does` or `reply`.',
  looksAt: ['flows'],
  check(model) {
    return flowsOf(model).flatMap((entry) =>
      stepsOf(entry)
        .filter((step) => step.does === undefined && step.reply === undefined)
        .map((step) => ({
          entry,
          field: `steps[${step.index}]`,
          message: `${quote(`${entry.id}#${step.id}`)} has neither \`does\` nor \`reply\`, so where it happens is not known.`,
          fix: 'Name the connection, part or flow it happens on in `does`, once that is known.',
        })),
    );
  },
};

/** All the rules, in the order they are listed. */
export const RULES: readonly Rule[] = [
  idTwice,
  referenceUnknown,
  referenceWrongKind,
  accessNotStore,
  viaEnd,
  connectionTwice,
  stepTwice,
  stepShape,
  stepEarlier,
  flowInItself,
  ruleShape,
  contextMany,
  recordUnused,
  featureAlone,
  stepUnplaced,
];

/**
 * Runs the rules over the entries, then judges the rules of the team's own. Counts are given, and
 * those rules judged, only when `whole`: every file outside `rules/` read.
 */
export function runRules(entries: readonly Entry[], whole: boolean, run: boolean): { problems: Problem[]; counts: Count[]; rulings: Ruling[] } {
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
  // A rule whose own file has an error is not judged; nor is any, when a file outside `rules/` did not read.
  const faulty = new Set(problems.filter((problem) => problem.severity === 'error').map((problem) => problem.file));
  const judged = judgeRules(model, run && whole, faulty);
  return { problems: [...problems, ...judged.problems], counts, rulings: judged.rulings };
}
