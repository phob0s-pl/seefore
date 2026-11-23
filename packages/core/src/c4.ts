/**
 * The C4 checks: what a model lacks by the rules of C4's notation. `docs/c4-checks.md` is
 * their spec. This file names what the checks report, and runs them on the model.
 */
import { CURRENT_FORMAT, nounOf, referenceField } from './format.ts';
import type { Format } from './format.ts';
import type { Model, ModelRecord } from './model.ts';
import { START, quote, warning } from './problem.ts';
import type { Position, Problem } from './problem.ts';

/** The codes of the set, in the order they are reported. */
export const C4_CODES = ['description-missing', 'technology-missing', 'connection-unnamed', 'connection-vague', 'element-unconnected'] as const;

/** The code of one check of the set. */
export type C4Code = (typeof C4_CODES)[number];

/**
 * What a finding of the set is. A note counts something that is missing: it is no problem of
 * the check, and never changes how a run ends. A warning is a problem as any other warning is.
 */
export type C4Severity = 'note' | 'warning';

/** One thing a check of the set found, written as a problem is. */
export interface C4Finding {
  /** The file of the record, as a path from the source directory. */
  file: string;
  line: number;
  column: number;
  message: string;
}

/** What one check of the set looked at and found. */
export interface C4Check {
  severity: C4Severity;
  /** How many records the check looked at; null when it was not run. */
  checked: number | null;
  /** What it found, in order of file. Empty when it was not run. */
  findings: C4Finding[];
}

/** What the set found on one reading of a source directory. */
export type C4Report = {
  /** Whether the directory was read in full: no error, no file left unread, no link not followed. */
  complete: boolean;
} & Record<C4Code, C4Check>;

/** What the checks need besides the model. */
export interface C4Options {
  /**
   * Whether the directory was read in full. A record whose file has an error is not in the
   * model, and its connections are not either, so what it touched would look alone: the check
   * of a connection runs only when this is true.
   */
  complete: boolean;
  /** Where the value of a key is written in a record's file. Without it, the start of the file. */
  placeOf?: (file: string, field: string) => Position;
  format?: Format;
}

/** How bad what each check finds is. Only a name that is the bare "Uses" is a problem. */
const SEVERITY: Readonly<Record<C4Code, C4Severity>> = {
  'description-missing': 'note',
  'technology-missing': 'note',
  'connection-unnamed': 'note',
  'connection-vague': 'warning',
  'element-unconnected': 'note',
};

/**
 * The one name that says nothing of what is done: the bare word, in either form and any case,
 * with nothing else in it. The case is folded as ASCII folds it, so no letter of another script
 * is read as one of these. This is a list of words, which the checks of stage 6a never read: C4's
 * own checklist names the bare "Uses", and the trial of stage 4 had to mend it throughout.
 */
const BARE_USES = /^uses?$/i;

/** A thing of the model, as the checks read it: what it is in, what it says it is for and is built with, and where its file is. */
type Thing = ModelRecord<{ in?: string | undefined; description?: string | undefined; technology?: string[] | undefined }>;

/** The folders of the things a person can be asked to name a technology for. */
const PARTS: readonly string[] = ['apps', 'stores', 'components'];

/**
 * Runs the five checks on a model. Each reads the model and no view, so hiding something in a
 * view never narrows what is checked. A record whose file has an error is not in the model, so
 * a field with a wrong value has its error and is in no count: only a field left out is.
 */
export function c4Of(model: Model, options: C4Options): C4Report {
  const format = options.format ?? CURRENT_FORMAT;
  const placeOf = options.placeOf ?? (() => START);
  const things = thingsOf(model);
  // What a part is built with. A person, a system and a piece of infrastructure are not asked.
  const parts = things.filter(([folder]) => PARTS.includes(folder));
  const named = model.connections.filter((connection) => connection.name !== undefined);

  return {
    complete: options.complete,
    'description-missing': ran(
      'description-missing',
      things.length,
      things
        .filter(([, thing]) => thing.description === undefined)
        .map(([folder, thing]) => note(thing.file, `This ${nounOf(format, folder)} has no description. Say what it is for, when that is known.`)),
    ),
    'technology-missing': ran(
      'technology-missing',
      parts.length,
      parts
        .filter(([, part]) => part.technology === undefined)
        .map(([folder, part]) => note(part.file, `This ${nounOf(format, folder)} names no technology. Name what it is built with, if the facts say.`)),
    ),
    'connection-unnamed': ran(
      'connection-unnamed',
      model.connections.length,
      model.connections
        .filter((connection) => connection.name === undefined)
        .map((connection) => note(connection.file, 'This connection has no name. Say what the one that acts does, when that is known.')),
    ),
    'connection-vague': ran(
      'connection-vague',
      named.length,
      named
        .filter((connection) => BARE_USES.test(connection.name as string))
        .map((connection) => ({
          file: connection.file,
          ...placeOf(connection.file, 'name'),
          message:
            `This connection is named ${quote(connection.name as string)}, which says nothing of what is done. ` +
            'Say what the one that acts does. If nobody knows yet, leave `name` out.',
        })),
    ),
    'element-unconnected': options.complete
      ? ran('element-unconnected', things.length, unconnected(format, model, things))
      : notRun('element-unconnected'),
  };
}

/** The report of a reading whose records were not read, as when the marker cannot say which format they are in: none of the five is run. */
export function c4NotRun(): C4Report {
  const report: Partial<C4Report> = { complete: false };
  for (const code of C4_CODES) report[code] = notRun(code);
  return report as C4Report;
}

/** What the set found that is a problem as any other is: each finding of a check whose findings are warnings. */
export function c4Warnings(report: C4Report): Problem[] {
  return C4_CODES.filter((code) => report[code].severity === 'warning').flatMap((code) =>
    report[code].findings.map((finding) => warning(finding.file, finding, code, finding.message)),
  );
}

/**
 * The things of the model, each with its folder: every person, system, app, store, component
 * and piece of infrastructure. They are found in order of file, since the checks report in it.
 */
function thingsOf(model: Model): [string, Thing][] {
  const things: [string, Thing][] = [];
  for (const folder of ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'] as const) {
    for (const record of model[folder]) things.push([folder, record]);
  }
  return things;
}

/**
 * Each thing that no connection starts at, ends at or names in `via`, and that has nothing
 * inside it that one does. The model is walked once: every end and every step of a route is
 * marked, and so is what each is in, up to the top. A connection under a condition counts, and
 * so does one whose channel the far side opened. Being in something, sharing an owner, being
 * named in words and standing in a view do not connect: none is an exchange.
 */
function unconnected(format: Format, model: Model, things: readonly [string, Thing][]): C4Finding[] {
  const inside = new Map(things.map(([, thing]) => [thing.id, thing.in]));
  const reached = new Set<string>();
  for (const connection of model.connections) {
    for (const start of [connection.from, connection.to, ...(connection.via ?? [])]) {
      // Once a thing is marked, so is everything it is in.
      for (let id: string | undefined = start; id !== undefined && !reached.has(id); id = inside.get(id)) reached.add(id);
    }
  }
  return things.filter(([, thing]) => !reached.has(thing.id)).map(([folder, thing]) => note(thing.file, unconnectedMessage(format, folder)));
}

/**
 * What the note on a thing with no connection says. It names only what can be so of the thing:
 * what is inside it, for a system or an app, which hold other things; and a connection passing
 * through it, for what `via` may name. A person and a store are neither.
 */
function unconnectedMessage(format: Format, folder: string): string {
  const noun = nounOf(format, folder);
  const holds = format.families.some((family) => family.record?.references.some((field) => field.field === 'in' && field.families.includes(folder)));
  const passed = referenceField(format, 'connections', 'via')?.families.includes(folder) ?? false;
  const at = holds ? `this ${noun} or at anything in it` : `this ${noun}`;
  const through = passed ? ', and none passes through it' : '';
  return `No connection starts or ends at ${at}${through}. That may be right: add one only for an exchange that the facts name.`;
}

/** A check that ran: how many records it looked at, and what it found, in order of file. */
function ran(code: C4Code, checked: number, findings: C4Finding[]): C4Check {
  return { severity: SEVERITY[code], checked, findings: findings.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0)) };
}

/** A check that was not run. */
function notRun(code: C4Code): C4Check {
  return { severity: SEVERITY[code], checked: null, findings: [] };
}

/** A note stands at the start of its file, since what it is about is not there. */
function note(file: string, message: string): C4Finding {
  return { file, ...START, message };
}
