import { z } from 'zod';
import { idProblem, isId } from './id.ts';
import { quote } from './problem.ts';
import { label } from './shape.ts';
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

/**
 * The id of another record. Whether a record has that id, and whether it is of a kind the
 * field may name, is a rule across records: one file alone cannot tell.
 */
const Id = z.string().refine(isId, {
  error: (issue) => `${label(issue.path ?? [])} must be an id. ${idProblem(String(issue.input))}`,
});

/** What a thing is built with, or the protocol a connection uses: ids of technologies, none twice. */
const Technologies = z
  .array(Id)
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

/** A kind of person who uses the software, runs it or takes part in what it does. No owner. */
export const PersonSchema = z.strictObject({
  name: Name,
  description: Description.optional(),
});

/** Software seen as one thing, ours or somebody else's. */
export const SystemSchema = z.strictObject({
  name: Name,
  description: Description.optional(),
  owner: Id.optional(),
});

/** Something that runs code, in a system. */
export const AppSchema = z.strictObject({
  name: Name,
  in: Id,
  description: Description.optional(),
  kind: z.enum(APP_KINDS).optional(),
  technology: Technologies.optional(),
  owner: Id.optional(),
});

/** Something that holds data, in a system. */
export const StoreSchema = z.strictObject({
  name: Name,
  in: Id,
  description: Description.optional(),
  kind: z.enum(STORE_KINDS).optional(),
  technology: Technologies.optional(),
  owner: Id.optional(),
});

/** A piece inside an app. */
export const ComponentSchema = z.strictObject({
  name: Name,
  in: Id,
  description: Description.optional(),
  technology: Technologies.optional(),
  owner: Id.optional(),
});

/**
 * One thing acts on another. Only its two ends are required, so that an arrow can be written
 * before anyone knows what to call it.
 */
export const ConnectionSchema = z.strictObject({
  from: Id,
  to: Id,
  name: Name.optional(),
  description: Description.optional(),
  technology: Technologies.optional(),
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
