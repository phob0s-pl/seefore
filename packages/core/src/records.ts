import { z } from 'zod';
import { idProblem, isId } from './id.ts';
import { capital, quote } from './problem.ts';
import { label, notAllowed } from './shape.ts';
import { DESCRIPTION_MAX, NAME_MAX } from './text.ts';

/**
 * The records of format 1, one schema for each family. They are the one definition of what a
 * record's file may hold; the rules across records are in `rules.ts`.
 */

/** How an app runs. */
export const APP_KINDS = ['service', 'browser', 'mobile', 'desktop', 'command', 'function', 'job'] as const;

/** What sort of data a store holds. */
export const STORE_KINDS = ['database', 'files', 'cache', 'index'] as const;

/** The characters that end a line. A name is on one line, so it holds none of them. */
const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/;

/** What people call a record: text on one line, at most 100 characters, no space at either end. */
const Name = z
  .string()
  .max(NAME_MAX)
  .refine((name) => /\S/.test(name), { message: '`name` is empty.', params: { code: 'value-too-small' } })
  .refine((name) => !LINE_BREAK.test(name), { message: '`name` must be on one line.' })
  // Only for a name that is on one line and not empty, so that one slip is reported once.
  .refine((name) => !/\S/.test(name) || LINE_BREAK.test(name) || name === name.trim(), {
    message: '`name` starts or ends with a space. Take the space off.',
  });

/** What a record is for, in a sentence or a few. It may have several lines. */
const Description = z
  .string()
  .max(DESCRIPTION_MAX)
  .refine((text) => /\S/.test(text), {
    message: '`description` is empty. Leave it out until there is something to say.',
    params: { code: 'value-too-small' },
  });

/** True for a value with a space in it: a name or a sentence, not an id with a slip in it. */
function hasSpace(value: string): boolean {
  return /\s/.test(value);
}

/**
 * The id of another record, in a field that says what it holds when its value is not an id.
 * `holds` says it in a sentence. `words` says what to do with a value that has a space in it:
 * such a value is never answered with an id made from its words. Whether a record has the id,
 * and whether it is of a kind the field may name, is a rule across records: one file alone
 * cannot tell.
 */
function idIn(holds: string, words: string) {
  return z.string().refine(isId, {
    error: (issue) => {
      const value = String(issue.input);
      return `${holds} ${hasSpace(value) ? words : idProblem(value)}`;
    },
  });
}

/** Where an id comes from, for a writer who wrote a name in its place. */
function fileOf(whose: string): string {
  return `An id has no spaces: it is the name of ${whose} file, without \`.yaml\`.`;
}

/** What an app or a store is part of. */
const InSystem = idIn('`in` holds the id of the system it is part of, a record in `systems/`.', fileOf("the system's"));

/** What a component is inside. */
const InApp = idIn('`in` holds the id of the app it is inside, a record in `apps/`.', fileOf("the app's"));

/** The one that acts. */
const From = idIn('`from` holds the id of the one that acts: a person, a system, an app, a store or a component.', fileOf("that record's"));

/** The one it acts on. */
const To = idIn('`to` holds the id of the one it acts on: a person, a system, an app, a store or a component.', fileOf("that record's"));

/**
 * Who answers for a part. Who cannot be named by an id is said in the description. `leftOut`
 * says what the part has for an owner when `owner` is left out.
 */
function ownerId(leftOut: string) {
  return idIn(
    '`owner` holds the id of a record in `owners/`.',
    `If who answers takes a sentence to say, leave \`owner\` out and put the sentence in the description.${leftOut}`,
  );
}

/** A system is in nothing, so with no `owner` it has none. */
const SystemOwner = ownerId('');

/** An app, a store or a component with no `owner` has the owner of what it is in. */
const PartOwner = ownerId(' Left out, the owner is taken from what the part is in: check that this is true.');

/**
 * One id in `technology`. A value with a space in it is a phrase, not a slip in an id; `phrase`
 * says where such a phrase goes.
 */
function technologyId(phrase: string) {
  return z.string().refine(isId, {
    error: (issue) => {
      const value = String(issue.input);
      const which = `${capital(label(issue.path ?? []))}, ${quote(value)},`;
      return hasSpace(value) ? `${which} is not the id of a technology. ${phrase}` : idProblem(value, which);
    },
  });
}

/** Ids of technologies, none twice. */
function technologies(phrase: string) {
  return z
    .array(technologyId(phrase))
    .refine((ids) => ids.length > 0, {
      message: '`technology` is an empty list. Leave it out until a technology is known.',
      params: { code: 'value-too-small' },
    })
    .superRefine((ids, context) => {
      // A list is a set, so an id written again says nothing more. The later one is reported.
      const seen = new Set<string>();
      ids.forEach((id, index) => {
        if (seen.has(id)) context.addIssue({ code: 'custom', path: [index], message: `${quote(id)} is in \`technology\` twice. Keep one.` });
        seen.add(id);
      });
    });
}

/** What a part is built with. */
const PartTechnologies = technologies('Name a technology by the id of its record in `technologies/`, and say anything more in the description.');

/** What a connection is carried in, such as a protocol. */
const ConnectionTechnologies = technologies('A phrase about how an exchange travels goes in the description.');

/**
 * What sort of data a store holds. A queue and a topic are stores with no kind until a later
 * stage gives them one, so a store that names either is told how to say it.
 */
const StoreKind = z
  .unknown()
  .refine((kind) => kind !== 'queue' && kind !== 'topic', {
    error: (issue) =>
      `${notAllowed(issue.path ?? [], STORE_KINDS)} A queue or a topic is a store with no \`kind\` at this stage. Say which in its description.`,
    params: { code: 'value-not-allowed' },
  })
  .pipe(z.enum(STORE_KINDS));

/** A kind of person who uses the software, runs it or takes part in what it does. No owner. */
export const PersonSchema = z.strictObject({
  name: Name,
  description: Description.optional(),
});

/** Software seen as one thing, ours or somebody else's. */
export const SystemSchema = z.strictObject({
  name: Name,
  description: Description.optional(),
  owner: SystemOwner.optional(),
});

/** Something that runs code, in a system. */
export const AppSchema = z.strictObject({
  name: Name,
  in: InSystem,
  description: Description.optional(),
  kind: z.enum(APP_KINDS).optional(),
  technology: PartTechnologies.optional(),
  owner: PartOwner.optional(),
});

/** Something that holds data, in a system. */
export const StoreSchema = z.strictObject({
  name: Name,
  in: InSystem,
  description: Description.optional(),
  kind: StoreKind.optional(),
  technology: PartTechnologies.optional(),
  owner: PartOwner.optional(),
});

/** A piece inside an app. */
export const ComponentSchema = z.strictObject({
  name: Name,
  in: InApp,
  description: Description.optional(),
  technology: PartTechnologies.optional(),
  owner: PartOwner.optional(),
});

/**
 * One thing acts on another. Only its two ends are required, so that an arrow can be written
 * before anyone knows what to call it.
 */
export const ConnectionSchema = z.strictObject({
  from: From,
  to: To,
  name: Name.optional(),
  description: Description.optional(),
  technology: ConnectionTechnologies.optional(),
});

/** A team, a role or an organisation that answers for a part and can be asked. */
export const OwnerSchema = z.strictObject({
  name: Name,
  description: Description.optional(),
});

/** A language, a framework, a product or a protocol with a name. */
export const TechnologySchema = z.strictObject({
  name: Name,
  description: Description.optional(),
});

export type Person = z.infer<typeof PersonSchema>;
export type System = z.infer<typeof SystemSchema>;
export type App = z.infer<typeof AppSchema>;
export type Store = z.infer<typeof StoreSchema>;
export type Component = z.infer<typeof ComponentSchema>;
export type Connection = z.infer<typeof ConnectionSchema>;
export type Owner = z.infer<typeof OwnerSchema>;
export type Technology = z.infer<typeof TechnologySchema>;
