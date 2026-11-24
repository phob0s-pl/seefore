import type { Problem, Ruling } from './answer.ts';
import { listOf, stepsOf, textOf } from './model.ts';
import type { Entry, Model } from './model.ts';
import { START, list, quote } from './problem.ts';
import { RECORD_FOLDERS } from './records.ts';
import type { Must, Selector, Subject } from './records.ts';
import { place } from './rules.ts';
import type { Finding, Rule } from './rules.ts';
import { dotted } from './shape.ts';

/**
 * The rules of a team's own, in `rules/`: their form, the ids they name, and how each is judged
 * from the other records. Each function is pure: it reads the model and gives what it found.
 */

/** A rule as it is read: its name, and `never`, or `each` with `must`. */
type RuleValue = { name: string; description?: string; never?: Subject; each?: Subject; must?: Must; debt?: string[] };

/** The things: what a connection joins, and what `within` and `external` speak of. */
const THINGS: readonly string[] = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];
/** The kinds that have an owner, and those that have a technology of their own. */
const OWNED: readonly string[] = ['systems', 'apps', 'stores', 'components', 'infrastructure', 'features'];
const BUILT: readonly string[] = ['apps', 'stores', 'components', 'infrastructure', 'connections'];
/** The kinds that may be there only under a condition. */
const CONDITIONAL: readonly string[] = [...THINGS, 'connections', 'features', 'flows'];

const valueOf = (entry: Entry): RuleValue => entry.fields as RuleValue;
const many = (value: string | string[] | undefined): string[] => (value === undefined ? [] : Array.isArray(value) ? value : [value]);
const isSelector = (value: unknown): value is Selector => typeof value === 'object' && value !== null && !Array.isArray(value);
const byId = (a: { id: string }, b: { id: string }): number => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

/** The subject of a rule: `never`, or `each`. */
function subjectOf(rule: RuleValue): { key: 'never' | 'each'; selector: Subject } | undefined {
  if (rule.never !== undefined) return { key: 'never', selector: rule.never };
  if (rule.each !== undefined) return { key: 'each', selector: rule.each };
  return undefined;
}

/** True when a rule chooses ways, not records. */
export function ofWays(entry: Entry): boolean {
  const rule = valueOf(entry);
  return rule.never?.way !== undefined || rule.each?.way !== undefined;
}

/** The name of a rule as a sentence: with a full stop, unless it ends in one already. */
export function sentence(name: string): string {
  return /[.!?]$/.test(name) ? name : `${name}.`;
}

// ---- the form across the keys

/** What one fault of form says, and where. */
type Fault = { field?: string; message: string; fix: string };

/** The faults of form of one rule that its shape lets through: which keys stand together, and what stands beside `way` and `through`. */
function faultsOf(rule: RuleValue): Fault[] {
  const faults: Fault[] = [];
  const has = (key: 'never' | 'each' | 'must') => rule[key] !== undefined;
  if (has('never') && (has('each') || has('must'))) {
    const other = has('each') ? 'each' : 'must';
    faults.push({
      field: other,
      message: `This rule has \`never\` and \`${other}\`. A rule has \`never\`, or \`each\` with \`must\`, and not both.`,
      fix: 'Keep one of the two forms here, and write the other as a rule of its own, in a file of its own.',
    });
  } else if (!has('never') && !has('each') && !has('must')) {
    faults.push({
      message: 'This rule has neither `never` nor `each` with `must`, so it says nothing that can be judged.',
      fix: 'Add `never` with a selector of what may not be in the model, or `each` with a selector and `must` with what each record it chooses must match.',
    });
  } else if (has('each') && !has('must')) {
    faults.push({ field: 'each', message: '`each` stands without `must`. A rule with `each` says in `must` what each record it chooses must match.', fix: 'Add `must` with what each record `each` chooses must match, or write the rule with `never`.' });
  } else if (has('must') && !has('each')) {
    faults.push({ field: 'must', message: '`must` stands without `each`. A rule with `must` says in `each` which records must match it.', fix: 'Add `each` with the records that must match `must`, or take `must` out.' });
  }
  const ways = rule.each?.way !== undefined;
  const mustIsThrough = ways && rule.must !== undefined && Object.keys(rule.must).length === 1 && rule.must.through !== undefined;
  if (ways && rule.must !== undefined && !mustIsThrough) {
    faults.push({ field: 'must', message: 'Of a rule of ways, `must` holds `through` and nothing else.', fix: 'Write `must: {through: <selector>}`: what every way from `from` to `to` must pass.' });
  }
  for (const key of ['never', 'each'] as const) {
    if (rule[key]?.way === undefined) continue;
    for (const other of Object.keys(rule[key] as Subject).filter((each) => each !== 'way')) {
      faults.push({
        field: `${key}.${other}`,
        message: `${quote(other)} stands beside \`way\` in ${quote(key)}. A rule chooses ways or records, not both.`,
        fix: `Move ${quote(other)} into \`from\` or \`to\` of the way, or write a rule of records of its own.`,
      });
    }
  }
  if (!ways && rule.must?.through !== undefined) {
    faults.push({
      field: 'must.through',
      message: '`must.through` stands only in `must` of a rule of ways, whose `each` is `{way: …}`.',
      fix: 'Take `through` out, or make `each` a way, as `each: {way: {from: …, to: …}}`.',
    });
  }
  return faults;
}

/** The rule `rule-shape`: the faults of form across the keys of a rule, one problem each. */
export const ruleShape: Rule = {
  id: 'rule-shape',
  gives: 'error',
  says: 'A rule has `never`, or `each` with `must`. `way` stands alone in `never` or `each`, and `through` alone in `must` of a rule of ways.',
  check(model) {
    return model.entries.filter((entry) => entry.ok && entry.kind === 'rules').flatMap((entry) => faultsOf(valueOf(entry)).map((fault): Finding => ({ entry, ...fault })));
  },
};

// ---- the ids a rule names

/** An id a rule names: where, as `never.within[1]`, the path of its key, and the kinds it may name. */
export type RuleReference = { id: string; path: string; key: (string | number)[]; field: string; kinds: readonly string[]; ways: boolean };

/** Every id that a rule names, in its selectors and in `debt`. The words `any` and `none` are no ids. */
export function ruleReferences(entry: Entry): RuleReference[] {
  const rule = valueOf(entry);
  const ways = ofWays(entry);
  const found: RuleReference[] = [];
  const add = (path: string[], field: string, value: string | string[] | undefined, kinds: readonly string[], words: boolean) => {
    if (Array.isArray(value)) value.forEach((id, index) => found.push({ id, path: dotted([...path, index]), key: path, field, kinds, ways }));
    else if (typeof value === 'string' && !(words && (value === 'any' || value === 'none'))) found.push({ id: value, path: dotted(path), key: path, field, kinds, ways });
  };
  const walk = (selector: Selector, path: string[]): void => {
    for (const [key, value] of Object.entries(selector)) {
      const at = [...path, key];
      if (key === 'id') add(at, key, value as string | string[], RECORD_FOLDERS, false);
      else if (key === 'within') add(at, key, value as string | string[], THINGS, false);
      else if (key === 'owner') add(at, key, value as string | string[], ['owners'], true);
      else if (key === 'technology') add(at, key, value as string | string[], ['technologies'], true);
      else if (key === 'data') add(at, key, value as string | string[], ['data'], true);
      else if (key === 'way') {
        const way = value as { from?: Selector; to?: Selector };
        if (isSelector(way.from)) walk(way.from, [...at, 'from']);
        if (isSelector(way.to)) walk(way.to, [...at, 'to']);
      } else if (isSelector(value)) walk(value, at);
    }
  };
  for (const key of ['never', 'each', 'must'] as const) {
    const selector = rule[key];
    if (selector !== undefined) walk(selector, [key]);
  }
  add(['debt'], 'debt', rule.debt, ways ? ['connections'] : RECORD_FOLDERS, false);
  return found;
}

// ---- the selector

/** What a selector asks of the model, worked out once for a judging. */
type Ground = {
  model: Model;
  /** The good records of the twelve folders, by id. */
  records: Entry[];
  things: Entry[];
  /** The good record of an id, of the twelve folders. */
  get(id: string | undefined): Entry | undefined;
  /** What a record is in, upwards, as records. */
  up(entry: Entry): Entry[];
  /** The data seen on each connection, from the steps of the flows. */
  seen: Map<string, Set<string>>;
  /** The connections a step of some flow names in `does`. */
  walked: Set<string>;
  /** The good connections from a thing, and to it, by id. */
  starting: Map<string, Entry[]>;
  ending: Map<string, Entry[]>;
};

function groundOf(model: Model): Ground {
  const records = model.entries.filter((entry) => entry.ok && entry.kind !== 'rules').sort(byId);
  const get = (id: string | undefined): Entry | undefined => {
    const entry = id === undefined ? undefined : model.record(id);
    return entry?.ok && entry.kind !== 'rules' ? entry : undefined;
  };
  const seen = new Map<string, Set<string>>();
  const walked = new Set<string>();
  for (const flow of records.filter((entry) => entry.kind === 'flows')) {
    const steps = stepsOf(flow);
    for (const step of steps) {
      const does = step.reply !== undefined ? steps.find((each) => each.id === step.reply)?.does : step.does;
      if (get(does)?.kind !== 'connections') continue;
      const id = does as string;
      if (step.does !== undefined) walked.add(id);
      for (const data of step.data) seen.set(id, (seen.get(id) ?? new Set()).add(data));
    }
  }
  const starting = new Map<string, Entry[]>();
  const ending = new Map<string, Entry[]>();
  for (const connection of records.filter((entry) => entry.kind === 'connections')) {
    const from = textOf(connection, 'from') as string;
    const to = textOf(connection, 'to') as string;
    starting.set(from, [...(starting.get(from) ?? []), connection]);
    ending.set(to, [...(ending.get(to) ?? []), connection]);
  }
  return {
    model,
    records,
    things: records.filter((entry) => THINGS.includes(entry.kind)),
    get,
    up: (entry) => model.chain(entry.id).flatMap((id) => get(id) ?? []),
    seen,
    walked,
    starting,
    ending,
  };
}

/** True when the values hold what is wanted: one of the ids or words given, or any value (`any`), or none (`none`). */
function holds(values: readonly string[], wanted: string | string[]): boolean {
  if (wanted === 'any') return values.length > 0;
  if (wanted === 'none') return values.length === 0;
  return values.some((value) => many(wanted).includes(value));
}

/** The text a record has in a field, as a list of none or one. */
const own = (entry: Entry, field: string): string[] => (typeof entry.fields[field] === 'string' ? [entry.fields[field] as string] : []);

/** A field of a thing, its own or the nearest up what it is in. */
const taken = (ground: Ground, entry: Entry, field: string): string[] => [entry, ...ground.up(entry)].map((each) => own(each, field)).find((values) => values.length > 0) ?? [];

/** The owner of a record: a feature's own; a part's own, or the nearest up its chain. */
const ownerOf = (ground: Ground, entry: Entry): string[] => (entry.kind === 'features' ? own(entry, 'owner') : taken(ground, entry, 'owner'));

/** The condition a record is there under: a thing's own or the nearest up its chain; any other's own. */
const onlyOf = (ground: Ground, entry: Entry): string[] => (THINGS.includes(entry.kind) ? taken(ground, entry, 'only') : own(entry, 'only'));

/** True when a record matches a selector: every key given holds, and a key its kind does not have makes it not match. */
function matches(ground: Ground, entry: Entry | undefined, selector: Selector): boolean {
  if (entry === undefined) return false;
  const thing = THINGS.includes(entry.kind);
  const connection = entry.kind === 'connections';
  for (const [key, wanted] of Object.entries(selector) as [keyof Selector, unknown][]) {
    switch (key) {
      case 'id':
        if (!many(wanted as string | string[]).includes(entry.id)) return false;
        break;
      case 'kind': {
        const kinds = many(wanted as string | string[]);
        if (!kinds.includes(entry.kind) && !own(entry, 'kind').some((kind) => kinds.includes(kind))) return false;
        break;
      }
      case 'within': {
        const tops = many(wanted as string | string[]);
        if (!thing || !(tops.includes(entry.id) || ground.model.chain(entry.id).some((up) => tops.includes(up)))) return false;
        break;
      }
      case 'not':
        if (matches(ground, entry, wanted as Selector)) return false;
        break;
      case 'owner':
        if (!OWNED.includes(entry.kind) || !holds(ownerOf(ground, entry), wanted as string | string[])) return false;
        break;
      case 'technology':
        if (!BUILT.includes(entry.kind) || !holds(listOf(entry, 'technology'), wanted as string | string[])) return false;
        break;
      case 'external':
        if (!thing || [entry, ...ground.up(entry)].some((each) => each.fields['external'] === true) !== wanted) return false;
        break;
      case 'only':
        if (!CONDITIONAL.includes(entry.kind) || !holds(onlyOf(ground, entry), wanted as string)) return false;
        break;
      case 'name':
      case 'description':
        if (!holds(own(entry, key), wanted as string)) return false;
        break;
      case 'opens':
        if (!connection || !holds(own(entry, 'opens'), wanted === 'to' ? 'any' : (wanted as string))) return false;
        break;
      case 'access':
        if (!connection || !holds(own(entry, 'access'), wanted as string | string[])) return false;
        break;
      case 'from':
      case 'to': {
        const end = ground.get(textOf(entry, key));
        if (!connection || end === undefined || !THINGS.includes(end.kind) || !matches(ground, end, wanted as Selector)) return false;
        break;
      }
      case 'via': {
        if (!connection) return false;
        const hops = listOf(entry, 'via');
        const found = wanted === 'any' || wanted === 'none' ? holds(hops, wanted) : hops.some((hop) => matches(ground, ground.get(hop), wanted as Selector));
        if (!found) return false;
        break;
      }
      case 'data':
        if (!connection || !holds([...(ground.seen.get(entry.id) ?? [])], wanted as string | string[])) return false;
        break;
      case 'connection':
        if (!thing || !atConnection(ground, entry, wanted as Selector | 'any' | 'none')) return false;
        break;
      default:
        // `way` and `through` stand only where a rule of ways has them, and are judged there.
        return false;
    }
  }
  return true;
}

/** True when a thing is an end of a connection the selector chooses, at the end it leaves open; or of any connection (`any`), or of none (`none`). */
function atConnection(ground: Ground, entry: Entry, wanted: Selector | 'any' | 'none'): boolean {
  const asFrom = ground.starting.get(entry.id) ?? [];
  const asTo = ground.ending.get(entry.id) ?? [];
  if (wanted === 'any') return asFrom.length + asTo.length > 0;
  if (wanted === 'none') return asFrom.length + asTo.length === 0;
  const pool = wanted.to !== undefined && wanted.from === undefined ? asFrom : wanted.from !== undefined && wanted.to === undefined ? asTo : [...asFrom, ...asTo];
  return pool.some((connection) => matches(ground, connection, wanted));
}

// ---- ways

/** The shortest way from a start to each thing it reaches: the ids of its connections, in order. */
type Reached = Map<string, string[]>;

/**
 * The things a way reaches from a start, each with the shortest way to it. A way is never continued
 * from a person or an outside thing other than its start. With `through`, it never steps onto a
 * thing `through` chooses, nor along a connection with a hop that `through` chooses. The
 * connections in `skip` are not walked.
 */
function reach(ground: Ground, start: Entry, through: Selector | undefined, skip: ReadonlySet<string>): Reached {
  const reached: Reached = new Map([[start.id, []]]);
  const queue: Entry[] = [start];
  const stops = (entry: Entry) => entry.kind === 'people' || [entry, ...ground.up(entry)].some((each) => each.fields['external'] === true);
  for (let at = queue.shift(); at !== undefined; at = queue.shift()) {
    if (at !== start && stops(at)) continue;
    for (const connection of ground.starting.get(at.id) ?? []) {
      const next = ground.get(textOf(connection, 'to'));
      if (skip.has(connection.id) || next === undefined || !THINGS.includes(next.kind) || reached.has(next.id)) continue;
      if (through !== undefined && (matches(ground, next, through) || listOf(connection, 'via').some((hop) => matches(ground, ground.get(hop), through)))) continue;
      reached.set(next.id, [...(reached.get(at.id) as string[]), connection.id]);
      queue.push(next);
    }
  }
  reached.delete(start.id);
  return reached;
}

/** True when a thing is an end of a way: the selector chooses it, or the end is left out, which is any thing. */
const isEnd = (ground: Ground, thing: Entry | undefined, end: Selector | undefined): boolean => thing !== undefined && (end === undefined || matches(ground, thing, end));

/** For each start `from` chooses, the ends `to` chooses that a way reaches, each with its shortest way. */
function waysOf(ground: Ground, from: Selector | undefined, to: Selector | undefined, through: Selector | undefined, skip: ReadonlySet<string>): Map<string, Reached> {
  const found = new Map<string, Reached>();
  for (const start of ground.things.filter((thing) => isEnd(ground, thing, from))) {
    if (through !== undefined && matches(ground, start, through)) continue;
    const ends: Reached = new Map();
    for (const [id, way] of reach(ground, start, through, skip)) if (isEnd(ground, ground.get(id), to)) ends.set(id, way);
    if (ends.size > 0) found.set(start.id, ends);
  }
  return found;
}

/** The pairs of a start and an end, as text. */
const pairsOf = (ways: Map<string, Reached>): Set<string> => new Set([...ways].flatMap(([start, ends]) => [...ends.keys()].map((end) => `${start} ${end}`)));

// ---- judging

/** What judging one rule found: its ruling, and its problems. */
type Judged = { ruling: Ruling; problems: Problem[] };

/** The problem of a rule at its own file. */
function atRule(entry: Entry, field: string | undefined, rule: string, severity: Problem['severity'], message: string, fix: string): Problem {
  return { ...place({ entry, ...(field !== undefined ? { field } : {}) }), rule, severity, message, fix };
}

const NOTHING_FIX = 'Change the selector so that it chooses what the name of the rule says, or add the records the model lacks.';

/** The warnings for `from` and `to` that choose no thing, anywhere but under `not`, and for `through`. */
function chooseNothing(ground: Ground, entry: Entry): Problem[] {
  const problems: Problem[] = [];
  const none = (path: string[], selector: Selector) => {
    if (!ground.things.some((thing) => matches(ground, thing, selector)))
      problems.push(atRule(entry, dotted(path), 'rule-looks-at-nothing', 'warning', `${quote(dotted(path))} chooses no thing, so the rule looks at nothing.`, NOTHING_FIX));
  };
  const walk = (selector: Selector, path: string[]): void => {
    for (const [key, value] of Object.entries(selector)) {
      const at = [...path, key];
      if (key === 'not') continue;
      if (key === 'way') {
        const way = value as { from?: Selector; to?: Selector };
        for (const end of ['from', 'to'] as const) {
          const chooses = way[end];
          if (chooses === undefined) continue;
          none([...at, end], chooses);
          walk(chooses, [...at, end]);
        }
        continue;
      }
      if (!isSelector(value)) continue;
      if (key === 'from' || key === 'to' || key === 'through') none(at, value);
      walk(value, at);
    }
  };
  const rule = valueOf(entry);
  for (const key of ['never', 'each', 'must'] as const) {
    const selector = rule[key];
    if (selector !== undefined) walk(selector, [key]);
  }
  return problems;
}

/** Judges a rule over records. */
function judgeRecords(ground: Ground, entry: Entry): Judged {
  const rule = valueOf(entry);
  const { key, selector } = subjectOf(rule) as { key: 'never' | 'each'; selector: Selector };
  const chosen = ground.records.filter((record) => matches(ground, record, selector));
  const must = (rule.must ?? {}) as Record<string, unknown>;
  const broken = key === 'never' ? chosen : chosen.filter((record) => !matches(ground, record, must as Selector));
  // A selector holds when each of its keys holds, so the keys that do not hold say what a record misses.
  const missed = (record: Entry): string[] => Object.keys(must).filter((each) => !matches(ground, record, { [each]: must[each] } as Selector));
  const debt = rule.debt ?? [];
  const problems: Problem[] = [];
  const second = place({ entry, field: key });
  for (const record of broken) {
    if (debt.includes(record.id)) continue;
    const only = onlyOf(ground, record)[0];
    problems.push({
      file: record.file,
      ...START,
      record: record.id,
      rule: `rules/${entry.id}`,
      severity: 'error',
      message: `${quote(record.id)} breaks the rule ${quote(entry.id)}: ${sentence(rule.name)}${only !== undefined ? ` It is there only ${only}.` : ''}`,
      fix: `Change the record so that the rule holds, or change the rule in \`rules/${entry.id}.yaml\`. To let it stand for now, add ${quote(record.id)} to \`debt\` of the rule.`,
      second,
    });
  }
  debt.forEach((id, index) => {
    if (!broken.some((record) => record.id === id)) problems.push(paid(entry, id, index));
  });
  if (key === 'each' && chosen.length === 0) problems.push(atRule(entry, 'each', 'rule-looks-at-nothing', 'warning', '`each` chooses no record, so the rule looks at nothing.', NOTHING_FIX));
  problems.push(...chooseNothing(ground, entry));
  const walked = walkedOf(ground, entry, rule);
  if (walked !== undefined) problems.push(...walked.problems);
  return {
    ruling: {
      rule: entry.id,
      state: 'holds',
      chosen: chosen.map((record) => record.id),
      breaks: broken.filter((record) => !debt.includes(record.id)).map((record) => record.id),
      ...(key === 'each' ? { misses: Object.fromEntries(broken.filter((record) => !debt.includes(record.id)).map((record) => [record.id, missed(record)])) } : {}),
      debt: debt.filter((id) => broken.some((record) => record.id === id)),
      ...(walked !== undefined ? { walked: walked.walked } : {}),
    },
    problems,
  };
}

/** The warning that an id in `debt` breaks the rule no more. */
function paid(entry: Entry, id: string, index: number): Problem {
  return atRule(entry, `debt[${index}]`, 'debt-paid', 'warning', `${quote(id)} is in \`debt\` of the rule and does not break it any more.`, `Take ${quote(id)} out of \`debt\`.`);
}

/** Of a rule with `data` directly in `never`, `each` or `must`: how many of the connections it could look at a flow walks, and the warning when none. */
function walkedOf(ground: Ground, entry: Entry, rule: RuleValue): { walked: { connections: number; walked: number }; problems: Problem[] } | undefined {
  const key = (['never', 'each', 'must'] as const).find((each) => rule[each]?.data !== undefined);
  if (key === undefined) return undefined;
  const subject = subjectOf(rule)?.selector as Selector;
  const { data: _data, ...rest } = subject;
  const near = ground.records.filter((record) => record.kind === 'connections' && (Object.keys(rest).length === 0 || matches(ground, record, rest)));
  const walked = near.filter((record) => ground.walked.has(record.id)).length;
  const problems =
    near.length > 0 && walked === 0
      ? [
          atRule(
            entry,
            `${key}.data`,
            'rule-looks-at-nothing',
            'warning',
            `The rule looks at \`data\`, and no flow walks any of the ${near.length} ${near.length === 1 ? 'connection' : 'connections'} it could look at.`,
            'Write a flow that walks these connections and names the data its steps pass, or take `data` out of the rule.',
          ),
        ]
      : [];
  return { walked: { connections: near.length, walked }, problems };
}

/** Judges a rule of ways. */
function judgeWays(ground: Ground, entry: Entry): Judged {
  const rule = valueOf(entry);
  const { key, selector } = subjectOf(rule) as { key: 'never' | 'each'; selector: Subject };
  const { from, to } = selector.way as { from?: Selector; to?: Selector };
  const through = key === 'each' ? rule.must?.through : undefined;
  const debt = rule.debt ?? [];
  // The pairs a way joins, and whether the rule looks at any, are of every connection; a break
  // is of a way that goes by no connection in debt.
  const all = waysOf(ground, from, to, undefined, new Set());
  const bad = waysOf(ground, from, to, through, new Set(debt));
  const problems: Problem[] = [];
  const ways: NonNullable<Ruling['ways']> = [];
  for (const start of [...bad.keys()].sort()) {
    const ends = [...(bad.get(start) as Reached)].sort(([a, wayA], [b, wayB]) => wayA.length - wayB.length || (a < b ? -1 : 1));
    const [end, by] = ends[0] as [string, string[]];
    const more = ends.length - 1;
    ways.push({ from: start, to: end, by, more });
    const rest = more === 0 ? '' : ` Ways from ${quote(start)} break it at ${more} more ${more === 1 ? 'end' : 'ends'}.`;
    problems.push(
      atRule(
        entry,
        key,
        `rules/${entry.id}`,
        'error',
        `A way from ${quote(start)} to ${quote(end)} breaks the rule: ${sentence(rule.name)} It goes by ${list(by)}.${rest}`,
        'Change a connection of the way, or the rule. To let the way stand for now, add one of its connections to `debt` of the rule.',
      ),
    );
  }
  // A connection in debt is paid when walking it again adds no break.
  const breaks = pairsOf(bad).size;
  const standing: string[] = [];
  debt.forEach((id, index) => {
    const again = new Set(debt.filter((each) => each !== id));
    const more = pairsOf(waysOf(ground, from, to, through, again)).size;
    if (more === breaks) problems.push(paid(entry, id, index));
    else standing.push(id);
  });
  const fromChosen = ground.things.some((thing) => isEnd(ground, thing, from));
  const toChosen = ground.things.some((thing) => isEnd(ground, thing, to));
  if (key === 'each' && through !== undefined) {
    if (all.size === 0 && fromChosen && toChosen)
      problems.push(atRule(entry, 'each.way', 'rule-looks-at-nothing', 'warning', `No way leads ${[from !== undefined ? 'from what `from` chooses' : '', to !== undefined ? 'to what `to` chooses' : ''].filter(Boolean).join(' ')}, so the rule looks at nothing.`, NOTHING_FIX));
    else if (all.size > 0 && ground.things.filter((thing) => isEnd(ground, thing, from)).every((thing) => matches(ground, thing, through)))
      problems.push(atRule(entry, 'must.through', 'rule-looks-at-nothing', 'warning', 'Everything `from` chooses is chosen by `through` too, so the rule looks at nothing.', NOTHING_FIX));
  }
  problems.push(...chooseNothing(ground, entry));
  return { ruling: { rule: entry.id, state: 'holds', chosen: [], breaks: [], pairs: pairsOf(all).size, ways, debt: standing }, problems };
}

/**
 * Judges every rule in `rules/`, in order of id. A rule is judged only when `judged` (every other
 * file of the model read) and its own file has no error, of which `faulty` names the files.
 */
export function judgeRules(model: Model, judged: boolean, faulty: ReadonlySet<string>): { problems: Problem[]; rulings: Ruling[] } {
  const rules = model.entries.filter((entry) => entry.kind === 'rules').sort(byId);
  if (rules.length === 0) return { problems: [], rulings: [] };
  const ground = groundOf(model);
  const problems: Problem[] = [];
  const rulings: Ruling[] = [];
  for (const entry of rules) {
    if (!judged || !entry.ok || faulty.has(entry.file)) {
      rulings.push({ rule: entry.id, state: 'not-judged', chosen: [], breaks: [], debt: [] });
      continue;
    }
    const { ruling, problems: found } = ofWays(entry) ? judgeWays(ground, entry) : judgeRecords(ground, entry);
    const broken = found.some((problem) => problem.rule === `rules/${entry.id}`);
    const nothing = found.some((problem) => problem.rule === 'rule-looks-at-nothing');
    rulings.push({ ...ruling, state: broken ? 'broken' : nothing ? 'nothing' : 'holds' });
    problems.push(...found);
  }
  return { problems, rulings };
}
