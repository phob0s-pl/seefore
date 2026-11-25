import type { ModelRecord } from './answer.ts';
import { byName } from './catalogue.ts';

/**
 * What the page of the context asks of the systems' records, worked out once: a band for each
 * system that has lines, in order, and the words of its count. Nothing is judged and nothing is
 * guessed from the words: each line stands under its kind where its author put it.
 */

/** One line of a system's context: its sentence, and its reason when it has one. */
export type ContextLine = { sentence: string; reason?: string };

/** One band of the page: a system, whether it is outside the team's, and its lines of each kind in the order of the file. */
export type Band = { id: string; name: string; external: boolean; must: ContextLine[]; prefer: ContextLine[] };

/** What the pages ask of the context. */
export type Context = {
  /** The bands: the team's own systems first, by name, then the outside ones, by name. A system with no lines has none. */
  bands: Band[];
  /** The band of one system; nothing when it has no lines. */
  band: (id: string) => Band | undefined;
};

/** A text with something in it, or nothing. */
const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

/** The band of a system's record, or nothing when it has no line with a `must` or a `prefer` of text. */
function bandOf(record: ModelRecord): Band | undefined {
  const must: ContextLine[] = [];
  const prefer: ContextLine[] = [];
  for (const line of Array.isArray(record.fields.context) ? (record.fields.context as unknown[]) : []) {
    if (!isMapping(line)) continue;
    // A line with both is a fault of the check's; it is read as the one that binds.
    const binds = text(line.must);
    const sentence = binds ?? text(line.prefer);
    if (sentence === undefined) continue;
    const reason = text(line.why);
    (binds !== undefined ? must : prefer).push({ sentence, ...(reason !== undefined ? { reason } : {}) });
  }
  if (must.length === 0 && prefer.length === 0) return undefined;
  return { id: record.id, name: text(record.fields.name) ?? record.id, external: record.fields.external === true, must, prefer };
}

/** The words of a band's count: "5 must · 2 prefer", "1 must" or "2 prefer". */
export function countWords(band: Band): string {
  return [band.must.length > 0 ? `${band.must.length} must` : '', band.prefer.length > 0 ? `${band.prefer.length} prefer` : ''].filter(Boolean).join(' · ');
}

/** What the pages ask of the context, worked out once from the records of `/api/model`. */
export function contextOf(records: readonly ModelRecord[]): Context {
  // An id names the first record that has it, as in the catalogue; a rule is no record of the architecture.
  const first = new Map<string, ModelRecord>();
  for (const record of records) if (record.kind !== 'rules' && !first.has(record.id)) first.set(record.id, record);
  const systems = [...first.values()].filter((record) => record.kind === 'systems');
  const sorted = [...systems.filter((record) => record.fields.external !== true).sort(byName), ...systems.filter((record) => record.fields.external === true).sort(byName)];
  const bands = sorted.flatMap((record) => bandOf(record) ?? []);
  const byId = new Map(bands.map((band) => [band.id, band]));
  return { bands, band: (id) => byId.get(id) };
}
