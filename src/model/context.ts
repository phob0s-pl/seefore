import type { ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';

/**
 * What the pages of the context ask of the records of `context/`, worked out once: the lines
 * that are about the whole model, the lines about each system, one line by its id, the lines
 * beside it, and the words of a count. Nothing is judged and nothing is guessed from the words
 * of a line.
 */

/** The two kinds of line: one that binds, and one that decides between designs that are allowed. */
export type ContextKind = 'must' | 'prefer';

/** One line of context: its id, its kind, its sentence, its reason when it has one, and the system it names when it names one. */
export type ContextLine = {
  id: string;
  kind: ContextKind;
  sentence: string;
  reason?: string;
  system?: string;
};

/**
 * The lines about one system, those that bind first: the system's id as the lines write it, its
 * name, whether it is outside the team's, and whether a system has that id at all.
 */
export type SystemContext = {
  id: string;
  name: string;
  external: boolean;
  known: boolean;
  lines: ContextLine[];
};

/** What the pages ask of the context. */
export type Context = {
  /** The lines about the whole model, those that bind first. */
  global: ContextLine[];
  /** The systems that lines name: the team's own first, by name, then the outside ones, by name, then the ids that name no system. */
  systems: SystemContext[];
  /** The lines about one system; nothing when no line names it. */
  system: (id: string) => SystemContext | undefined;
  /** The line with an id; nothing when there is none. */
  line: (id: string) => ContextLine | undefined;
  /** The other lines of a line's group: the global ones, or those about its system. */
  beside: (line: ContextLine) => ContextLine[];
};

const collator = new Intl.Collator('en', {
  sensitivity: 'accent',
  numeric: true,
});

/** A text with something in it, or nothing. */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);

/** A record of `context/` as a line, or nothing when it has neither a `must` nor a `prefer` of text. */
function lineOf(record: ModelRecord): ContextLine | undefined {
  // A record with both is a fault of the check's; it is read as the one that binds.
  const binds = text(record.fields.must);
  const sentence = binds ?? text(record.fields.prefer);
  if (sentence === undefined) return undefined;
  const reason = text(record.fields.why);
  const system = text(record.fields.system);
  return {
    id: record.id,
    kind: binds !== undefined ? 'must' : 'prefer',
    sentence,
    ...(reason !== undefined ? { reason } : {}),
    ...(system !== undefined ? { system } : {}),
  };
}

/** Those that bind first, then those it prefers; each kind by its sentence, then by its id. */
const inOrder = (lines: readonly ContextLine[]): ContextLine[] =>
  [...lines].sort((a, b) => Number(a.kind === 'prefer') - Number(b.kind === 'prefer') || collator.compare(a.sentence, b.sentence) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

/** The words of a count of lines: "5 must · 2 prefer", "1 must" or "2 prefer". */
export function countWords(lines: readonly ContextLine[]): string {
  const count = (kind: ContextKind) => lines.filter((line) => line.kind === kind).length;
  return (['must', 'prefer'] as const).flatMap((kind) => (count(kind) > 0 ? [`${count(kind)} ${kind}`] : [])).join(' · ');
}

/** What the pages ask of the context, worked out once from the records of `/api/model`. */
export function contextOf(records: readonly ModelRecord[]): Context {
  // An id names the first record that has it, as in the catalogue.
  const first = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind !== 'rules' && !first.has(record.id)) first.set(record.id, record);
  const lines = [...first.values()].filter((record) => record.kind === 'context').flatMap((record) => lineOf(record) ?? []);

  const global = inOrder(lines.filter((line) => line.system === undefined));
  const named = new Map<string, ContextLine[]>();
  for (const line of lines) if (line.system !== undefined) named.set(line.system, [...(named.get(line.system) ?? []), line]);

  const all = [...first.values()].filter((record) => record.kind === 'systems' && named.has(record.id));
  const own = all.filter((record) => record.fields.external !== true).sort(byName);
  const outside = all.filter((record) => record.fields.external === true).sort(byName);
  const found = new Set(all.map((record) => record.id));
  const systems: SystemContext[] = [
    ...[...own, ...outside].map((record) => ({
      id: record.id,
      name: text(record.fields.name) ?? record.id,
      external: record.fields.external === true,
      known: true,
      lines: inOrder(named.get(record.id) ?? []),
    })),
    // A line that names no system is told by the check; the page shows it under the id as written.
    ...[...named.keys()]
      .filter((id) => !found.has(id))
      .sort()
      .map((id) => ({
        id,
        name: id,
        external: false,
        known: false,
        lines: inOrder(named.get(id) ?? []),
      })),
  ];
  const bySystem = new Map(systems.map((system) => [system.id, system]));
  const byId = new Map(lines.map((line) => [line.id, line]));
  return {
    global,
    systems,
    system: (id) => bySystem.get(id),
    line: (id) => byId.get(id),
    beside: (line) => (line.system === undefined ? global : (bySystem.get(line.system)?.lines ?? [])).filter((each) => each.id !== line.id),
  };
}
