import { z } from 'zod';
import { ID, ID_MAX, idProblem } from './id.ts';
import { capital, quote } from './problem.ts';
import { label } from './shape.ts';

/**
 * The records of format 1, one shape for each kind, and the marker. They are the one definition
 * of what a file may hold: the checks read them, and `npm run schema` writes them as JSON
 * Schema. Each kind and each field carries its definition in words.
 */

export const NAME_MAX = 100;
export const DESCRIPTION_MAX = 2000;
export const ONLY_MAX = 100;

export const APP_KINDS = ['service', 'browser', 'mobile', 'desktop', 'command', 'function', 'job'] as const;
export const STORE_KINDS = ['database', 'files', 'cache', 'index', 'queue', 'topic'] as const;
export const ACCESS = ['read', 'write', 'read-write'] as const;

const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/;

/** One line, not blank, no space at either end. */
const ONE_LINE = /^\S(?:[^\n\r\u0085\u2028\u2029]*\S)?$/;

/** Text on one line, 1 to `max` characters, no space at either end. `field` is named in the messages. */
function oneLine(field: string, max: number) {
  return z
    .string()
    .min(1, { error: `${quote(field)} is empty.` })
    .max(max)
    .regex(ONE_LINE, {
      error: (issue) => {
        const text = String(issue.input);
        if (!/\S/.test(text)) return `${quote(field)} is empty.`;
        if (LINE_BREAK.test(text)) return `${quote(field)} must be on one line.`;
        return `${quote(field)} starts or ends with a space. Take the space off.`;
      },
    });
}

const Name = oneLine('name', NAME_MAX).meta({ description: 'What people call it: one line of 1 to 100 characters, with no space at either end.' });

const Description = z
  .string()
  .min(1)
  .max(DESCRIPTION_MAX)
  .regex(/\S/, { error: '`description` is empty. Leave it out until there is something to say.' })
  .meta({ description: 'What it is responsible for, in 1 to 2,000 characters. Its first sentence says what the thing is: a box shows that sentence.' });

const Only = oneLine('only', ONLY_MAX)
  .refine((only) => !/^only(?![\p{L}\p{M}\p{N}_])/iu.test(only), { error: '`only` holds the words that read after "only". Take the first word off.' })
  .meta({ description: 'When the thing is there at all: the words that read after "only", one line of at most 100 characters. Left out when it is always there.' });

/** One id, in a field that says what it holds when the value is not an id. */
function id(holds: string) {
  return z
    .string()
    .max(ID_MAX)
    .regex(ID, {
      error: (issue) => {
        const value = String(issue.input);
        const how = /\s/.test(value) ? "An id has no spaces: it is the name of that record's file, without `.yaml`." : idProblem(value);
        return `${holds} ${how}`;
      },
    });
}

/** A list of ids, none twice, in a field named `field`. */
function ids(field: string, holds: string) {
  return z
    .array(
      z
        .string()
        .max(ID_MAX)
        .regex(ID, {
          error: (issue) => {
            const value = String(issue.input);
            const which = `${capital(label(issue.path ?? []))}, ${quote(value)},`;
            return /\s/.test(value) ? `${which} is not an id. ${holds}` : idProblem(value, which) ?? holds;
          },
        }),
    )
    .min(1)
    .superRefine((list, context) => {
      const seen = new Set<string>();
      list.forEach((item, index) => {
        if (seen.has(item)) context.addIssue({ code: 'custom', path: [index], message: `${quote(item)} is in ${quote(field)} twice. Keep one.` });
        seen.add(item);
      });
    });
}

const parts = 'a person, a system, an app, a store, a component or a piece of infrastructure';
const From = id(`\`from\` holds the id of the one that acts: ${parts}.`).meta({ description: `The id of the one that acts: ${parts}, at any level.` });
const To = id(`\`to\` holds the id of the one it acts on: ${parts}.`).meta({ description: `The id of the one it acts on: ${parts}, at any level.` });

const Owner = id('`owner` holds the id of a record in `owners/`.').meta({
  description: 'The id of the owner, a record in owners/, who answers for the part. Left out, it is that of what the part is in.',
});

const partTechnology = ids('technology', 'Name a technology by the id of its record in `technologies/`, and say anything more in the description.').meta({
  description: 'What it is built with, or the format it keeps: ids of records in technologies/, a set. Never a protocol a part only speaks.',
});

const External = z.literal(true).meta({ description: '`true`: the people this model is kept for cannot change the system. Left out for a system of yours, and when nobody has said.' });

const Kinds = (what: string, list: readonly string[]) => `${what}: ${list.join(', ')}.`;

/** A kind of person who uses the software, runs it or takes part in an exchange. */
export const PersonSchema = z
  .strictObject({ name: Name, only: Only.optional(), description: Description.optional() })
  .meta({ description: 'A kind of person who uses the software, runs it or takes part in an exchange. A role, not an individual.' });

export const SystemSchema = z
  .strictObject({ name: Name, only: Only.optional(), description: Description.optional(), external: External.optional(), owner: Owner.optional() })
  .meta({ description: 'Software its users see as one whole, ours or somebody else\'s. Nothing is above it. C4 calls it a software system.' });

export const AppSchema = z
  .strictObject({
    name: Name,
    in: id('`in` holds the id of the system it is part of, a record in `systems/`.').meta({ description: 'The id of the system the app is part of, a record in systems/.' }),
    only: Only.optional(),
    description: Description.optional(),
    kind: z.enum(APP_KINDS).meta({ description: Kinds('How the app runs', APP_KINDS) }).optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
  })
  .meta({ description: 'Code that runs as a unit of its own: started, deployed or scaled apart from the rest. In one system. C4 calls it a container.' });

export const StoreSchema = z
  .strictObject({
    name: Name,
    in: id('`in` holds the id of the system it is part of, a record in `systems/`, or of the app that keeps it, a record in `apps/`.').meta({
      description: 'The id of the system the store is part of, a record in systems/, or of the one app that keeps it, a record in apps/.',
    }),
    only: Only.optional(),
    description: Description.optional(),
    kind: z.enum(STORE_KINDS).meta({ description: Kinds('What the store holds. A queue and a topic hold messages on their way', STORE_KINDS) }).optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
  })
  .meta({ description: 'Addressable data that others read or write: a database, files, a cache, an index, a queue, a topic. C4 calls it a container.' });

export const ComponentSchema = z
  .strictObject({
    name: Name,
    in: id('`in` holds the id of the app it is inside, a record in `apps/`.').meta({ description: 'The id of the app the component is inside, a record in apps/.' }),
    only: Only.optional(),
    description: Description.optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
  })
  .meta({ description: 'A responsibility inside one running app. It runs only as part of that app.' });

export const ConnectionSchema = z
  .strictObject({
    from: From,
    to: To,
    via: ids('via', '`via` holds the ids of what the exchange passes through, nearest to `from` first. Say anything more in the description.')
      .meta({ description: 'What the exchange passes through, in order from `from`: pieces of infrastructure, apps, components, systems. Never a store, never an end.' })
      .optional(),
    opens: z.literal('to').meta({ description: '`to`: the far side opened the channel this exchange goes down. Left out when the one that sends opened it, or nobody has said.' }).optional(),
    access: z
      .enum(ACCESS)
      .meta({ description: 'What the connection does to the store it ends at: read, write or read-write. Left out for neither, and for "not said".' })
      .optional(),
    name: oneLine('name', NAME_MAX).meta({ description: 'The few words on the arrow, a verb first: one line of 1 to 100 characters. May be left out.' }).optional(),
    only: Only.optional(),
    description: Description.optional(),
    technology: ids('technology', 'A phrase about how an exchange travels goes in the description.')
      .meta({ description: 'What the exchange is carried in, such as a protocol or a format: ids of records in technologies/, a set.' })
      .optional(),
  })
  .meta({ description: 'One thing acts on another, for one purpose. It has an id of its own. C4 calls it a relationship.' });

export const InfrastructureSchema = z
  .strictObject({
    name: Name,
    in: id('`in` holds the id of the system it is part of, a record in `systems/`.')
      .meta({ description: 'The id of the system the piece is part of, a record in systems/. Left out when it stands between systems or nobody has placed it.' })
      .optional(),
    only: Only.optional(),
    description: Description.optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
  })
  .meta({ description: 'A thing whose whole job is to pass exchanges on: a proxy, a gateway, a load balancer. Named in `via`.' });

export const OwnerSchema = z
  .strictObject({ name: Name, description: Description.optional() })
  .meta({ description: 'The team, role or organisation that answers for a part and can be asked.' });

export const TechnologySchema = z
  .strictObject({ name: Name, description: Description.optional() })
  .meta({ description: 'A thing with a name that a part is built with or an exchange is carried in: a language, a product, a protocol, a format.' });

/** The shape of each kind's file, by folder. */
export const SHAPES = {
  people: PersonSchema,
  systems: SystemSchema,
  apps: AppSchema,
  stores: StoreSchema,
  components: ComponentSchema,
  connections: ConnectionSchema,
  infrastructure: InfrastructureSchema,
  owners: OwnerSchema,
  technologies: TechnologySchema,
} as const;

/** The marker `seefore.yaml`: the format, and the name of the model. */
export const MarkerSchema = z
  .strictObject({
    format: z.literal(1).meta({ description: 'The format of the files. It is 1.' }),
    name: oneLine('name', NAME_MAX).meta({ description: 'The name of the model: one line of 1 to 100 characters, with no space at either end.' }),
  })
  .meta({ description: 'The marker of a seefore model: the file seefore.yaml at the top of its folder.' });
