import type { ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';

/**
 * What the pages of the context ask of the systems' records, worked out once: each system that
 * has lines, in order, its lines, one line by its place, and the words of a system's count.
 * Nothing is judged and nothing is guessed from the words of a line.
 */

/** The two kinds of line: one that binds, and one that decides between designs that are allowed. */
export type ContextKind = 'must' | 'prefer';

/** One line of a system's context: its place in the file, from 1; its kind; its sentence; and its reason when it has one. */
export type ContextLine = { place: number; kind: ContextKind; sentence: string; reason?: string };

/** A system that has lines: whether it is outside the team's, and its lines, those that bind first, each kind in the order of the file. */
export type SystemContext = { id: string; name: string; external: boolean; lines: ContextLine[] };

/** What the pages ask of the context. */
export type Context = {
  /** The systems that have lines: the team's own first, by name, then the outside ones, by name. */
  systems: SystemContext[];
  /** One system; nothing when it has no lines. */
  system: (id: string) => SystemContext | undefined;
  /** The line of a system at a place in its file; nothing when there is none. */
  line: (id: string, place: number) => ContextLine | undefined;
};

/** A text with something in it, or nothing. */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** A system's record with its lines, or nothing when it has no line with a `must` or a `prefer` of text. */
function systemOf(record: ModelRecord): SystemContext | undefined {
  const read: ContextLine[] = [];
  const written = Array.isArray(record.fields.context) ? (record.fields.context as unknown[]) : [];
  written.forEach((line, index) => {
    if (!isMapping(line)) return;
    // A line with both is a fault of the check's; it is read as the one that binds.
    const binds = text(line.must);
    const sentence = binds ?? text(line.prefer);
    if (sentence === undefined) return;
    const reason = text(line.why);
    read.push({ place: index + 1, kind: binds !== undefined ? 'must' : 'prefer', sentence, ...(reason !== undefined ? { reason } : {}) });
  });
  if (read.length === 0) return undefined;
  const lines = [...read.filter((line) => line.kind === 'must'), ...read.filter((line) => line.kind === 'prefer')];
  return { id: record.id, name: text(record.fields.name) ?? record.id, external: record.fields.external === true, lines };
}

/** The words of a system's count: "5 must · 2 prefer", "1 must" or "2 prefer". */
export function countWords(system: SystemContext): string {
  const count = (kind: ContextKind) => system.lines.filter((line) => line.kind === kind).length;
  return (['must', 'prefer'] as const).flatMap((kind) => (count(kind) > 0 ? [`${count(kind)} ${kind}`] : [])).join(' · ');
}

/** What the pages ask of the context, worked out once from the records of `/api/model`. */
export function contextOf(records: readonly ModelRecord[]): Context {
  // An id names the first record that has it, as in the catalogue; a rule is no record of the architecture.
  const first = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind !== 'rules' && !first.has(record.id)) first.set(record.id, record);
  const all = [...first.values()].filter((record) => record.kind === 'systems');
  const sorted = [...all.filter((record) => record.fields.external !== true).sort(byName), ...all.filter((record) => record.fields.external === true).sort(byName)];
  const systems = sorted.flatMap((record) => systemOf(record) ?? []);
  const byId = new Map(systems.map((system) => [system.id, system]));
  return { systems, system: (id) => byId.get(id), line: (id, place) => byId.get(id)?.lines.find((line) => line.place === place) };
}
