import type { ModelRead, ModelRecord, Problem, Ruling } from './answer.ts';
import { byName } from './catalogue.ts';
import { rulingsLine } from './counts.ts';

/**
 * What the pages of the rules ask of `records`, `rulings` and `problems`, worked out and never
 * judged again: the rows of the list, the words of Found, the dot of the sidebar's entry, what
 * the page of one rule shows, and the rules a record breaks. The check has judged; this reads.
 */

/** The state of a rule, as the check gave it. */
export type RuleState = Ruling['state'];

/** The states in the order the list shows them: broken first, then not judged, then looks at nothing, then holds. */
export const STATES: readonly RuleState[] = ['broken', 'not-judged', 'nothing', 'holds'];

/** One row of the list: the rule's id, its name when its file has a record, its state and what was found. */
export type RuleRow = { id: string; name?: string; state: RuleState; found: string };

/** The dot of the sidebar's entry: a rule is broken, or none is and one is not judged. */
export type Dot = 'broken' | 'not-judged' | undefined;

/** One line of a selector as written: the keys on the way to a value, and the value, as ids or as plain words. */
export type SelectorLine = { keys: string[]; ids: string[] } | { keys: string[]; words: string };

/** One selector of a rule as written, under its label: "Never", "Each" or "Must". */
export type Written = { label: 'Never' | 'Each' | 'Must'; lines: SelectorLine[] };

/** A way that breaks a rule: the things it passes in order, the connections it goes by, and how many more ends from its start break it. */
export type WayRead = { things: string[]; by: string[]; more: number };

/** An id in `debt`: whether it still breaks the rule and stands, or breaks it no more and is paid. */
export type DebtRow = { id: string; paid: boolean };

/** What a rule looked at: the records `each` chose, by name, and the lines that say the rest. */
export type LookedAt = { records: string[]; lines: string[] };

/** One rule as its page reads it. */
export type RuleRead = {
  id: string;
  /** Its record; none when its file has a fault of form. */
  record?: ModelRecord;
  /** Its name, when it has a record. */
  name?: string;
  ruling: Ruling;
  /** The problems of its own file but its breaks. */
  problems: Problem[];
  /** It is not judged, and its own file has no error: another file has one. */
  elsewhere: boolean;
  /** The records that break it and are not in `debt`, by name. */
  breaks: string[];
  /** Its selectors as written: none when it has no record. */
  written: Written[];
  /** The ways that break it, each with the things it passes. */
  ways: WayRead[];
  debt: DebtRow[];
  /** What it looked at; nothing when it is not judged. */
  lookedAt?: LookedAt;
};

/** A rule that a record breaks, is in debt of, or, for a connection, is on a way that breaks. */
export type RuleOf = { rule: string; name?: string; how: 'breaks' | 'debt' | 'way' };

/** What the pages ask of the rules. */
export type Rulebook = {
  /** The check's own last line: "27 rules of your own: 17 hold, 10 broken. 2 of debt." Nothing with no rule. */
  line?: string;
  /** The rows of the list, in order of state, then of name. */
  rows: RuleRow[];
  dot: Dot;
  /** One rule, by its id; nothing when no rule has it. */
  rule: (id: string) => RuleRead | undefined;
  /** The rules a record breaks, is in debt of, or is on a way that breaks, in the order of the list. */
  rulesOf: (id: string) => RuleOf[];
};

/**
 * The keys that a line of a selector reads first, in this order: the answer gives the fields in
 * the order of the schema, not of the file, and a connection reads from its start to its end.
 */
const FIRST: readonly string[] = ['way', 'from', 'to', 'through', 'via'];

/** The keys whose values are ids, unless the word `any` or `none`. */
const ID_KEYS: ReadonlySet<string> = new Set(['id', 'within', 'owner', 'technology', 'data']);

const collator = new Intl.Collator('en', { sensitivity: 'accent', numeric: true });
const text = (value: unknown): string | undefined => (typeof value === 'string' ? value : undefined);
const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
/** "1 record breaks it", "2 records break it": a count with its words for one and for many. */
const counted = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** The file of a rule. */
export const fileOf = (id: string): string => `rules/${id}.yaml`;

/** A value at the end of a selector in plain words: a list with commas, anything else as it reads. */
function wordsOf(value: unknown): string {
  if (Array.isArray(value)) return value.map(wordsOf).join(', ');
  if (typeof value === 'string') return value;
  if (isMapping(value)) return JSON.stringify(value);
  return String(value);
}

/** The keys of a mapping in the order its lines are read: `way`, `from`, `to`, `through` and `via` first, then the rest as given. */
const readingOrder = (a: string, b: string): number => (FIRST.includes(a) ? FIRST.indexOf(a) : FIRST.length) - (FIRST.includes(b) ? FIRST.indexOf(b) : FIRST.length);

/**
 * The lines of a selector: one for each value at a leaf, with the keys on the way to it, as
 * `['from', 'not', 'owner']`. A value of `id`, `within`, `owner`, `technology` or `data` is a
 * list of ids, unless it is the word `any` or `none`; any other is plain words. `way` is walked
 * as keys like the rest. An empty mapping is one line with nothing after its keys.
 */
export function selectorLines(selector: unknown, keys: readonly string[] = []): SelectorLine[] {
  if (isMapping(selector)) {
    const entries = Object.entries(selector).sort(([a], [b]) => readingOrder(a, b));
    if (entries.length === 0) return [{ keys: [...keys], words: '' }];
    return entries.flatMap(([key, value]) => selectorLines(value, [...keys, key]));
  }
  const last = keys.at(-1);
  if (last !== undefined && ID_KEYS.has(last) && selector !== 'any' && selector !== 'none') {
    const ids = typeof selector === 'string' ? [selector] : Array.isArray(selector) && selector.every((each) => typeof each === 'string') ? (selector as string[]) : undefined;
    if (ids !== undefined) return [{ keys: [...keys], ids }];
  }
  return [{ keys: [...keys], words: wordsOf(selector) }];
}

/** The selectors of a rule's record as written, in the order `never`, `each`, `must`. */
export function writtenOf(record: ModelRecord): Written[] {
  const labels = [
    ['never', 'Never'],
    ['each', 'Each'],
    ['must', 'Must'],
  ] as const;
  return labels.flatMap(([key, label]) => (record.fields[key] !== undefined ? [{ label, lines: selectorLines(record.fields[key]) }] : []));
}

/** The things a way passes: the start of its first connection, then the end of each connection it goes by. */
export function thingsOf(way: { from: string; by: readonly string[] }, record: (id: string) => ModelRecord | undefined): string[] {
  const first = way.by[0] !== undefined ? text(record(way.by[0])?.fields.from) : undefined;
  return [first ?? way.from, ...way.by.flatMap((id) => text(record(id)?.fields.to) ?? [])];
}

/**
 * What was found, in the words of the list: what breaks the rule, or why it is not judged; then,
 * after a comma, its debt and the debt paid. Nothing for a rule that holds with no debt.
 * `own` is the problems of the rule's own file.
 */
export function foundWords(ruling: Ruling, own: readonly Problem[]): string {
  const parts: string[] = [];
  if (ruling.state === 'broken')
    parts.push(ruling.ways !== undefined ? counted(ruling.ways.length, 'way breaks it', 'ways break it') : counted(ruling.breaks.length, 'record breaks it', 'records break it'));
  if (ruling.state === 'not-judged') {
    const errors = own.filter((problem) => problem.severity === 'error').length;
    parts.push(errors > 0 ? `${counted(errors, 'error', 'errors')} in its file` : 'Another file has an error');
  }
  if (ruling.debt.length > 0) parts.push(`${ruling.debt.length} of debt`);
  const paid = own.filter((problem) => problem.rule === 'debt-paid').length;
  if (paid > 0) parts.push(`${counted(paid, 'debt', 'debts')} paid`);
  return parts.join(', ');
}

/** The dot of the sidebar's entry: red when a rule is broken, orange when none is and one is not judged. */
export function dotOf(rulings: readonly Ruling[]): Dot {
  if (rulings.some((ruling) => ruling.state === 'broken')) return 'broken';
  if (rulings.some((ruling) => ruling.state === 'not-judged')) return 'not-judged';
  return undefined;
}

/** "Every record of the model, 240. None is like this.": what a ban over records looked at. */
function bannedLine(total: number, chosen: number): string {
  const like = chosen === 0 ? 'None is like this.' : chosen === 1 ? '1 is like this.' : `${chosen} are like this.`;
  return `Every record of the model, ${total}. ${like}`;
}

/** What a judged rule looked at: the records `each` chose, the whole model for `never`, the pairs a way joins, and the connections the flows walk. */
function lookedAtOf(ruling: Ruling, record: ModelRecord | undefined, total: number, sorted: (ids: readonly string[]) => string[]): LookedAt | undefined {
  if (ruling.state === 'not-judged') return undefined;
  const walked =
    ruling.walked !== undefined ? [`The flows walk ${ruling.walked.walked} of the ${counted(ruling.walked.connections, 'connection', 'connections')} it could look at.`] : [];
  if (ruling.pairs !== undefined) return { records: [], lines: [`${counted(ruling.pairs, 'pair', 'pairs')} of a start and an end that a way joins.`, ...walked] };
  if (record?.fields.never !== undefined) return { records: [], lines: [bannedLine(total, ruling.chosen.length), ...walked] };
  return { records: sorted(ruling.chosen), lines: walked };
}

/** What the pages ask of the rules, worked out once from what `/api/model` answers. */
export function rulebookOf({ records, rulings, problems }: Pick<ModelRead, 'records' | 'rulings' | 'problems'>): Rulebook {
  // A rule's record, and the first record of each other id: what the catalogue holds.
  const rules = new Map<string, ModelRecord>();
  const others = new Map<string, ModelRecord>();
  for (const record of records) {
    const into = record.kind === 'rules' ? rules : others;
    if (!into.has(record.id)) into.set(record.id, record);
  }
  const record = (id: string) => others.get(id);
  const nameOf = (id: string) => text(rules.get(id)?.fields.name);
  const own = (id: string) => problems.filter((problem) => problem.file === fileOf(id));
  // Records by name, as the lists of Models have them; an id that names none stands last.
  const sorted = (ids: readonly string[]): string[] => {
    const found = ids.flatMap((id) => others.get(id) ?? []).sort(byName);
    return [...found.map((each) => each.id), ...ids.filter((id) => !others.has(id))];
  };

  const rows: RuleRow[] = rulings
    .map((ruling) => {
      const name = nameOf(ruling.rule);
      return { id: ruling.rule, ...(name !== undefined ? { name } : {}), state: ruling.state, found: foundWords(ruling, own(ruling.rule)) };
    })
    .sort((a, b) => STATES.indexOf(a.state) - STATES.indexOf(b.state) || collator.compare(a.name ?? a.id, b.name ?? b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const order = new Map(rows.map((row, index) => [row.id, index]));

  const rule = (id: string): RuleRead | undefined => {
    const ruling = rulings.find((each) => each.rule === id);
    if (ruling === undefined) return undefined;
    const found = rules.get(id);
    const name = nameOf(id);
    const mine = own(id);
    const debt = Array.isArray(found?.fields.debt) ? found.fields.debt.filter((each): each is string => typeof each === 'string') : [];
    return {
      id,
      ...(found !== undefined ? { record: found } : {}),
      ...(name !== undefined ? { name } : {}),
      ruling,
      problems: mine.filter((problem) => problem.rule !== `rules/${id}`),
      elsewhere: ruling.state === 'not-judged' && !mine.some((problem) => problem.severity === 'error'),
      breaks: sorted(ruling.breaks),
      written: found !== undefined ? writtenOf(found) : [],
      ways: (ruling.ways ?? []).map((way) => ({ things: thingsOf(way, record), by: way.by, more: way.more })),
      // A debt is judged only with its rule: while the rule is not judged, no debt is said.
      debt: ruling.state === 'not-judged' ? [] : debt.map((each) => ({ id: each, paid: !ruling.debt.includes(each) })),
      lookedAt: lookedAtOf(ruling, found, others.size, sorted),
    };
  };

  const rulesOf = (id: string): RuleOf[] =>
    rulings
      .flatMap((ruling): RuleOf[] => {
        const how = ruling.breaks.includes(id) ? 'breaks' : ruling.debt.includes(id) ? 'debt' : ruling.ways?.some((way) => way.by.includes(id)) ? 'way' : undefined;
        const name = nameOf(ruling.rule);
        return how !== undefined ? [{ rule: ruling.rule, ...(name !== undefined ? { name } : {}), how }] : [];
      })
      .sort((a, b) => (order.get(a.rule) ?? 0) - (order.get(b.rule) ?? 0));

  const line = rulingsLine(rulings);
  return { ...(line !== undefined ? { line } : {}), rows, dot: dotOf(rulings), rule, rulesOf };
}
