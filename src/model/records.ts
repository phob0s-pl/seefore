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
/** The most characters of a flow's `starts` and `ends`. */
export const SENTENCE_MAX = 200;
/** The most characters of the description of a step or a field. */
export const NOTE_MAX = 300;

export const APP_KINDS = ['service', 'browser', 'mobile', 'desktop', 'command', 'function', 'job'] as const;
export const STORE_KINDS = ['database', 'files', 'cache', 'index', 'queue', 'topic'] as const;
export const ACCESS = ['read', 'write', 'read-write'] as const;

const LINE_BREAK = /[\n\r\u0085\u2028\u2029]/;

/** One line, not blank, no space at either end. */
const ONE_LINE = /^\S(?:[^\n\r\u0085\u2028\u2029]*\S)?$/;

/** The value a message is about, in words that start a sentence: "`name`", or "`name` of the third step". */
const subject = (path: readonly PropertyKey[] | undefined, field: string): string => capital(path !== undefined && path.length > 0 ? label(path) : quote(field));

/** Text on one line, 1 to `max` characters, no space at either end. `field` is named in the messages. */
function oneLine(field: string, max: number) {
  return z
    .string()
    .min(1, { error: (issue) => `${subject(issue.path, field)} is empty.` })
    .max(max)
    .regex(ONE_LINE, {
      error: (issue) => {
        const text = String(issue.input);
        const which = subject(issue.path, field);
        if (!/\S/.test(text)) return `${which} is empty.`;
        if (LINE_BREAK.test(text)) return `${which} must be on one line.`;
        return `${which} starts or ends with a space. Take the space off.`;
      },
    });
}

const Name = oneLine('name', NAME_MAX).meta({ description: 'What people call it: one line of 1 to 100 characters, with no space at either end.' });

/** Text of 1 to `max` characters that is not blank, for a `description`. */
function prose(max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(/\S/, { error: (issue) => `${subject(issue.path, 'description')} is empty. Leave it out until there is something to say.` });
}

const Description = prose(DESCRIPTION_MAX).meta({ description: 'What it is responsible for, in 1 to 2,000 characters. Its first sentence says what the thing is: a box shows that sentence.' });

const Only = oneLine('only', ONLY_MAX)
  .refine((only) => !/^only(?![\p{L}\p{M}\p{N}_])/iu.test(only), { error: (issue) => `${subject(issue.path, 'only')} holds the words that read after "only". Take the first word off.` })
  .meta({ description: 'When the thing is there at all: the words that read after "only", one line of at most 100 characters. Left out when it is always there.' });

/** One id, in a field that says what it holds when the value is not an id: `holds` reads after the field's name. */
function id(field: string, holds: string) {
  return z
    .string()
    .max(ID_MAX)
    .regex(ID, {
      error: (issue) => {
        const value = String(issue.input);
        const how = /\s/.test(value) ? "An id has no spaces: it is the name of that record's file, without `.yaml`." : idProblem(value);
        return `${subject(issue.path, field)} ${holds} ${how}`;
      },
    });
}

/** A list of ids, none twice. `holds` says what the list holds, when a value is not an id. */
function ids(holds: string) {
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
        // The message is written where the whole path is known: `checkShape`.
        if (seen.has(item)) context.addIssue({ code: 'custom', path: [index], message: `${quote(item)} is in the list twice. Keep one.`, params: { twice: item } });
        seen.add(item);
      });
    });
}

const parts = 'a person, a system, an app, a store, a component or a piece of infrastructure';
const From = id('from', `holds the id of the one that acts: ${parts}.`).meta({ description: `The id of the one that acts: ${parts}, at any level.` });
const To = id('to', `holds the id of the one it acts on: ${parts}.`).meta({ description: `The id of the one it acts on: ${parts}, at any level.` });

const Owner = id('owner', 'holds the id of a record in `owners/`.').meta({
  description: 'The id of the owner, a record in owners/, who answers for the part. Left out, it is that of what the part is in.',
});

const partTechnology = ids('Name a technology by the id of its record in `technologies/`, and say anything more in the description.').meta({
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
    in: id('in', 'holds the id of the system it is part of, a record in `systems/`.').meta({ description: 'The id of the system the app is part of, a record in systems/.' }),
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
    in: id('in', 'holds the id of the system it is part of, a record in `systems/`, or of the app that keeps it, a record in `apps/`.').meta({
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
    in: id('in', 'holds the id of the app it is inside, a record in `apps/`.').meta({ description: 'The id of the app the component is inside, a record in apps/.' }),
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
    via: ids('`via` holds the ids of what the exchange passes through, nearest to `from` first. Say anything more in the description.')
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
    technology: ids('A phrase about how an exchange travels goes in the description.')
      .meta({ description: 'What the exchange is carried in, such as a protocol or a format: ids of records in technologies/, a set.' })
      .optional(),
  })
  .meta({ description: 'One thing acts on another, for one purpose. It has an id of its own. C4 calls it a relationship.' });

export const InfrastructureSchema = z
  .strictObject({
    name: Name,
    in: id('in', 'holds the id of the system it is part of, a record in `systems/`.')
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

const touched = `${parts.replace(' or a piece', ', a piece')} or a connection`;

export const FeatureSchema = z
  .strictObject({
    name: Name,
    description: prose(DESCRIPTION_MAX).meta({ description: 'What somebody gets from it, and who, in 1 to 2,000 characters. What is known to be missing is said here too.' }).optional(),
    only: Only.optional(),
    owner: id('owner', 'holds the id of a record in `owners/`.')
      .meta({ description: 'The id of the owner, a record in owners/, who is responsible for the feature. It is written on the feature and never taken from its parts.' })
      .optional(),
    touches: ids(`\`touches\` holds the ids of ${touched}.`)
      .meta({ description: `The ids of the parts and connections that are the feature's own and that no flow of it reaches: ${touched}. A list with no id twice.` })
      .optional(),
  })
  .meta({ description: 'A thing the software does for somebody, under the name its own people already use for it, as it is today.' });

const StepSchema = z
  .strictObject({
    id: id('id', "holds the step's own id in its flow, in the form of a record's id.").meta({ description: "The step's own id in its flow, in the form of a record's id, given once. `flow#step` is its address." }),
    does: id('does', 'holds the id of a connection, a part or a flow.')
      .meta({ description: 'The id of a connection (one part acts on another), of a part (it happens there) or of a flow (it runs here, whole). Never with `reply`.' })
      .optional(),
    reply: id('reply', 'holds the id of an earlier step of this flow.')
      .meta({ description: 'The id of an earlier step of this flow that names a connection: its answer travels back. Never with `does`.' })
      .optional(),
    after: ids('`after` holds the ids of earlier steps of this flow.')
      .meta({ description: 'The ids of earlier steps this one comes after, where that is not the step above.' })
      .optional(),
    name: oneLine('name', NAME_MAX)
      .meta({ description: 'What happens, verb first: one line of 1 to 100 characters. Left out where the name of the connection or of the flow in `does` says it.' })
      .optional(),
    only: Only.optional(),
    description: prose(NOTE_MAX).meta({ description: 'A sentence or two of 1 to 300 characters: a wait, a retry, a refusal.' }).optional(),
    data: ids('`data` holds the ids of records in `data/`.')
      .meta({ description: 'The ids of the data this step passes, records in data/: on a step on a connection, or on a reply. A list with no id twice.' })
      .optional(),
  })
  .meta({ description: 'One step of a flow: what happens on a connection, in a part or as a whole flow, or the answer to an earlier step.' });

export const FlowSchema = z
  .strictObject({
    name: oneLine('name', NAME_MAX).meta({ description: 'The task, in the words of the one who starts it: one line of 1 to 100 characters.' }),
    starts: oneLine('starts', SENTENCE_MAX).meta({ description: 'Who or what starts it: a person, a clock, a message. One line of 1 to 200 characters.' }),
    ends: oneLine('ends', SENTENCE_MAX).meta({ description: 'What is true at the end, with what makes it true. One line of 1 to 200 characters.' }),
    description: prose(DESCRIPTION_MAX).meta({ description: 'What it promises, what that costs, what must never happen, in 1 to 2,000 characters.' }).optional(),
    only: Only.optional(),
    feature: id('feature', 'holds the id of the one feature the flow belongs to, a record in `features/`.').meta({ description: 'The id of the one feature the flow belongs to, a record in features/.' }),
    steps: z
      .array(StepSchema)
      .min(1)
      .meta({ description: 'The steps in order, at least one, each a mapping with its own `id`.' }),
  })
  .meta({ description: 'One path through the model, told for one outcome: what starts it, the acts in order, each on a record the model holds, and what is true at the end.' });

const FieldSchema = z
  .strictObject({
    name: oneLine('name', NAME_MAX).meta({ description: 'What the field is called: words, not an id, one line of 1 to 100 characters. It stands once in its record.' }),
    description: prose(NOTE_MAX).meta({ description: 'What it holds, in 1 to 300 characters.' }).optional(),
  })
  .meta({ description: 'One thing a data record holds: a name and, if wanted, a description. It has no type.' });

export const DataSchema = z
  .strictObject({
    name: Name,
    description: prose(DESCRIPTION_MAX).meta({ description: 'What it is, in 1 to 2,000 characters.' }).optional(),
    fields: z
      .array(FieldSchema)
      .min(1)
      .superRefine((fields, context) => {
        const first = new Map<string, number>();
        fields.forEach((field, index) => {
          const before = first.get(field.name);
          if (before === undefined) first.set(field.name, index);
          else
            context.addIssue({
              code: 'custom',
              path: [index, 'name'],
              params: { code: 'field-twice' },
              message: `${capital(label(['fields', index]))} has the name ${quote(field.name)}, as ${label(['fields', before])} has. A field's name stands once in its record.`,
            });
        });
      })
      .meta({ description: 'What it holds: a list of at least one field, each with a `name` that stands once.' })
      .optional(),
  })
  .meta({ description: 'A thing with a name that one part passes to another: what is sent, what comes back, what is put into a store or taken from it. It is no schema.' });

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
  features: FeatureSchema,
  flows: FlowSchema,
  data: DataSchema,
} as const;

/** The marker `seefore.yaml`: the format, and the name of the model. */
export const MarkerSchema = z
  .strictObject({
    format: z.literal(1).meta({ description: 'The format of the files. It is 1.' }),
    name: oneLine('name', NAME_MAX).meta({ description: 'The name of the model: one line of 1 to 100 characters, with no space at either end.' }),
  })
  .meta({ description: 'The marker of a seefore model: the file seefore.yaml at the top of its folder.' });
