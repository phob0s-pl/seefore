import type { ModelRecord } from './answer.ts';
import { SEVERITIES, STATUSES } from './records.ts';

/** How heavy a point is: a block must be answered, and a note waits for nobody. */
export type Severity = (typeof SEVERITIES)[number];
/** Where a point stands: `open` when its file says nothing. */
export type Status = (typeof STATUSES)[number];

/**
 * What a point is about, as the page shows it: the address as written; the name of what it
 * names, which is the address itself when it names nothing; for a step of a flow, the step's
 * words; the record it names, for its tile; where it leads, when it leads anywhere; and
 * whether it is the need of the change, which is no record.
 */
export type About = { address: string; label: string; step?: string; record?: ModelRecord; to?: string; need?: true };

/** One point of a review, as its page reads it. */
export type Point = { id: string; name: string; severity: Severity; status: Status; about: About[]; finding?: string; recommendation?: string; comments: string[] };

/** The review of a change: the mark of the change as it was read, and its points in the order of the file. */
export type Review = { read?: string; points: Point[] };

const text = (value: unknown): string | undefined => (typeof value === 'string' && value.trim() !== '' ? value : undefined);
const isMapping = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const oneOf = <T extends string>(all: readonly T[], value: unknown): T | undefined => all.find((each) => each === value);

/**
 * A review as its pages read it, from its record. `about` says what an address names. What the
 * check would fault is read as far as it goes: a point with no name stands under its id, one
 * with no severity is a note, and what is no text is left out.
 */
export function reviewOf(record: ModelRecord, about: (address: string) => About): Review {
  const read = text(record.fields.read);
  const written = isMapping(record.fields.points) ? record.fields.points : {};
  const points = Object.entries(written).flatMap(([id, value]): Point[] => {
    if (!isMapping(value)) return [];
    const finding = text(value.finding);
    const recommendation = text(value.recommendation);
    return [
      {
        id,
        name: text(value.name) ?? id,
        severity: oneOf(SEVERITIES, value.severity) ?? 'note',
        status: oneOf(STATUSES, value.status) ?? 'open',
        about: (Array.isArray(value.about) ? value.about : []).flatMap((address) => (text(address) !== undefined ? [about(address as string)] : [])),
        ...(finding !== undefined ? { finding } : {}),
        ...(recommendation !== undefined ? { recommendation } : {}),
        comments: (Array.isArray(value.comments) ? value.comments : []).flatMap((line) => text(line) ?? []),
      },
    ];
  });
  return { ...(read !== undefined ? { read } : {}), points };
}
