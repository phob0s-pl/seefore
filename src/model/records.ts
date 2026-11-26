import { z } from 'zod';
import { ID, ID_MAX, idProblem } from './id.ts';
import { CHANGED_FOLDERS } from './kinds.ts';
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
/** What a step does to the store its connection ends at, where the connection says `read-write`. */
export const STEP_ACCESS = ['read', 'write'] as const;

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
  .meta({
    description:
      'The condition under which the thing is there at all, begun with "when", "on" or "for", so that it reads after the word "only": `only: when a customer pays by card`. One line of at most 100 characters. Left out when it is always there.',
  });

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
  description:
    'What it is built with, or the format it keeps: ids of records in technologies/, a set. Never a protocol a part only speaks. When it is built with one of several, name them all and say in the description that one is chosen.',
});

const External = z.literal(true).meta({ description: '`true`: the people this model is kept for cannot change the system. Left out for a system of yours, and when nobody has said.' });

/** The id of the repository a system's or an app's code is in, with the words of where it is written. */
const repository = (description: string) => id('repository', 'holds the id of a record in `repositories/`.').meta({ description });

const Kinds = (what: string, list: readonly string[]) => `${what}: ${list.join(', ')}.`;

/** A kind of person who uses the software, runs it or takes part in an exchange. */
export const PersonSchema = z
  .strictObject({ name: Name, only: Only.optional(), description: Description.optional() })
  .meta({
    description:
      'A kind of person who uses the software, runs it or takes part in an exchange. A role, not an individual. Written when an entry point shows that such a user is there: a page, a command, an interface for clients.',
  });

/** The most lines of context that are global, and the most about one system: a dozen sentences, not a handbook. Over it the check warns. */
export const CONTEXT_MAX = 12;

/** One text of a line of context: a sentence or two on one line, 1 to 300 characters. `key` is named in the messages. */
function contextText(key: string) {
  return z
    .string()
    .min(1, { error: (issue) => `${subject(issue.path, key)} is empty.` })
    .max(NOTE_MAX)
    .regex(ONE_LINE, {
      error: (issue) => {
        const text = String(issue.input);
        const which = subject(issue.path, key);
        if (!/\S/.test(text)) return `${which} is empty.`;
        if (LINE_BREAK.test(text)) return `${which} must be on one line. A text that is folded with \`>-\` is one line.`;
        return `${which} starts or ends with a space. Take the space off.`;
      },
    });
}

/**
 * A line of context, a record of its own: a sentence that binds (`must`) or one that decides
 * between designs that are allowed (`prefer`), and its reason. It is about the whole model, or
 * about the one system it names. The key says how strong the line is; the sentence is its name.
 */
export const ContextSchema = z
  .strictObject({
    must: contextText('must').meta({ description: 'A line that binds: a design that goes against it is wrong. A sentence or two on one line, 1 to 300 characters. Never with `prefer`.' }).optional(),
    prefer: contextText('prefer')
      .meta({ description: 'A line that decides between designs that are allowed. It may yield, and its `why` says when. A sentence or two on one line, 1 to 300 characters. Never with `must`.' })
      .optional(),
    why: contextText('why').meta({ description: 'Its reason, and where it comes from: a contract, a decision, a person who can vouch. One line of 1 to 300 characters.' }),
    system: id('system', 'holds the id of a record in `systems/`.')
      .meta({ description: 'The one system the line is about: the id of a record in `systems/`, yours or an outside one. Left out, the line is about the whole model.' })
      .optional(),
  })
  .superRefine((line, context) => {
    if (line.must !== undefined && line.prefer !== undefined)
      context.addIssue({
        code: 'custom',
        path: ['prefer'],
        params: { code: 'context-line' },
        message: 'This line has both `must` and `prefer`. A line binds or it decides between designs: keep one of the two, or write two files.',
      });
    else if (line.must === undefined && line.prefer === undefined)
      context.addIssue({ code: 'custom', path: [], params: { code: 'context-line' }, message: 'This line has neither `must` nor `prefer`. Write the sentence under `must` if it binds, under `prefer` if it may yield.' });
  })
  .meta({
    description:
      'A line of context: what is true of the whole model, or of the one system it names, and that no record of the architecture says. `must` or `prefer`, and `why`. A limit with its reason, never a description.',
    oneOf: [{ required: ['must'] }, { required: ['prefer'] }],
  });

export const SystemSchema = z
  .strictObject({
    name: Name,
    only: Only.optional(),
    description: Description.optional(),
    external: External.optional(),
    owner: id('owner', 'holds the id of a record in `owners/`.').meta({ description: 'The id of the owner, a record in owners/, who answers for the system. Left out when nobody has said.' }).optional(),
    repository: repository(
      "The id of the repository its code is in, a record in repositories/: written on the system only when the code of all its apps is there, else on each app. Left out when it is the one the model's folder lies in, and when nobody has said.",
    ).optional(),
  })
  .meta({ description: 'Software its users see as one whole, ours or somebody else\'s. Nothing is above it. C4 calls it a software system.' });

export const AppSchema = z
  .strictObject({
    name: Name,
    in: id('in', 'holds the id of the system it is part of, a record in `systems/`.').meta({ description: 'The id of the system the app is part of, a record in systems/.' }),
    only: Only.optional(),
    description: Description.optional(),
    kind: z
      .enum(APP_KINDS)
      .meta({
        description:
          "How the app runs. service: it runs until it is stopped. browser: in a person's browser. mobile: on a phone or a tablet. desktop: a program a person starts on their own machine. command: a person or a script starts it, and it ends. function: started by an event. job: started by a schedule.",
      })
      .optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
    repository: repository('The id of the repository its code is in, a record in repositories/. Left out, it is that of its system: leave it out where it is the same.').optional(),
  })
  .meta({
    description:
      'Code that runs as a unit of its own: started, deployed or scaled apart from the rest. One code that a deploy file or config starts under two commands or roles is two apps; copies of one are one app. The subcommands a person types at a program are that program. A part built elsewhere and started or pinned here is an app too. In one system. C4 calls it a container.',
  });

export const StoreSchema = z
  .strictObject({
    name: Name,
    in: id('in', 'holds the id of the system it is part of, a record in `systems/`, or of the app that keeps it, a record in `apps/`.').meta({
      description: 'The id of the system the store is part of, a record in systems/, or of the one app that keeps it, a record in apps/: the app, when no other app reads or writes the store. One that reaches it through that app does not count.',
    }),
    only: Only.optional(),
    description: Description.optional(),
    kind: z.enum(STORE_KINDS).meta({ description: `${Kinds('What the store holds', STORE_KINDS)} A queue and a topic hold messages on their way; a bucket of objects is files.` }).optional(),
    technology: partTechnology.optional(),
    owner: Owner.optional(),
  })
  .meta({
    description:
      'Addressable data that others read or write: a database, files, a cache, an index, a queue, a topic. Of a broker, each queue or topic is a store, and the broker is its technology. C4 calls it a container.',
  });

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
    opens: z.literal('to').meta({ description: '`to`: the far side opened the channel this exchange goes down, as when an agent dials out and the server sends down that tunnel: `from` the server, `to` the agent, `opens: to`. The dialling is no connection of its own. Left out when the one that sends opened it, or nobody has said.' }).optional(),
    access: z
      .enum(ACCESS)
      .meta({ description: 'What the connection does to the store it ends at: read, write or read-write. Left out for neither, and for "not said".' })
      .optional(),
    name: oneLine('name', NAME_MAX).meta({ description: 'The few words on the arrow, a verb first: one line of 1 to 100 characters. May be left out.' }).optional(),
    only: Only.optional(),
    description: prose(DESCRIPTION_MAX).meta({ description: 'What passes and why, where the name does not say it, in 1 to 2,000 characters.' }).optional(),
    technology: ids('A phrase about how an exchange travels goes in the description.')
      .meta({ description: 'What the exchange is carried in, such as a protocol or a format: ids of records in technologies/, a set.' })
      .optional(),
  })
  .meta({
    description:
      'One thing acts on another, for one purpose. It has an id of its own. Two connections may join the same two things, one for each purpose, and `from` and `to` may be one thing, when a part talks to its own copies. C4 calls it a relationship.',
  });

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
  .meta({ description: 'A thing whose whole job is to pass exchanges on: a proxy, a gateway, a load balancer, a mail relay. Named in `via`.' });

export const OwnerSchema = z
  .strictObject({ name: Name, description: Description.optional() })
  .meta({ description: 'The team, role or organisation that answers for a part and can be asked.' });

export const TechnologySchema = z
  .strictObject({ name: Name, description: Description.optional() })
  .meta({ description: 'A thing with a name that a part is built with or an exchange is carried in: a language, a product, a protocol, a format.' });

/** The most characters of a repository's `url`. */
export const URL_MAX = 200;

/** What a repository is cloned from: an address begun with `https://`, `http://`, `ssh://` or `git://` and more, or `user@host:path`, with no `/`, `\`, `:` or `@` in the user or the host. No space, line break or U+0085 anywhere. */
const CLONED = /^(?:(?:https|http|ssh|git):\/\/[^\s\u0085]+|[^\s\u0085/\\:@]+@[^\s\u0085/\\:@]+:[^\s\u0085]+)$/;

/** What begins a path on a disk: `/`, `\`, `~`, `.`, `file:` in any case, or a drive's letter and a colon. */
const ON_DISK = /^(?:[/\\~.]|file:|[a-z]:)/i;

/** Why a `url` is no address a repository is cloned from, in words that start after its name: a path on a disk, a space, or neither form. */
function notCloned(url: string): string {
  const disk = ON_DISK.exec(url)?.[0];
  if (disk !== undefined) return `is a path on a disk: it begins with ${quote(disk)}. A \`url\` says where the repository is cloned from.`;
  if (/[\s\u0085]/.test(url)) return 'has a space or a line break in it. An address a repository is cloned from has neither.';
  return 'is no address a repository is cloned from: it neither begins with `https://`, `http://`, `ssh://` or `git://`, nor has the form `user@host:path`.';
}

/** What a folder's name cannot hold, and so a repository's `name`: a slash, a backslash, a colon or a control character. */
const NOT_IN_NAME = /[/\\:\u0000-\u001f]/;

/** The first character of a name that a folder's name cannot hold, in words: "`:`", or "the control character U+0009". */
function heldInName(name: string): string {
  const found = NOT_IN_NAME.exec(name)?.[0] ?? '';
  return found < ' ' ? `the control character U+${found.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}` : quote(found);
}

/** A check that runs only on a value whose other checks hold, so that one fault is told once. */
const afterTheRest = (payload: { issues: readonly unknown[] }): boolean => payload.issues.length === 0;

export const RepositorySchema = z
  .strictObject({
    name: oneLine('name', NAME_MAX)
      .refine((name) => !NOT_IN_NAME.test(name), {
        when: afterTheRest,
        error: (issue) => `${subject(issue.path, 'name')} holds ${heldInName(String(issue.input))}. A repository's \`name\` is the name of the folder a plain clone of it makes, and a folder's name cannot hold it.`,
        params: { code: 'repository-name' },
      })
      .refine((name) => name !== '.' && name !== '..', {
        error: (issue) => `${subject(issue.path, 'name')} is ${quote(String(issue.input))}, which names a folder by where it is, and not by its name.`,
        params: { code: 'repository-name' },
      })
      .meta({
        description: 'Its own name, as the folder of a plain clone bears it: one line of 1 to 100 characters, with no slash, backslash or colon.',
        not: { anyOf: [{ pattern: NOT_IN_NAME.source }, { enum: ['.', '..'] }] },
      }),
    description: prose(DESCRIPTION_MAX).meta({ description: 'What of the system lies in it, in 1 to 2,000 characters: the code of which parts, the deploy files, the documents.' }).optional(),
    url: z
      .string()
      .min(1, { error: (issue) => `${subject(issue.path, 'url')} is empty.` })
      .max(URL_MAX)
      // An empty `url` is told by `min` alone.
      .refine((url) => url === '' || CLONED.test(url), {
        error: (issue) => `${subject(issue.path, 'url')} ${notCloned(String(issue.input))}`,
        params: { code: 'repository-url' },
      })
      .meta({
        description:
          'Where it is cloned from: one line of 1 to 200 characters with no space, begun with `https://`, `http://`, `ssh://` or `git://`, or of the form `git@host:path`. Never a path on a disk.',
        pattern: CLONED.source,
      })
      .optional(),
    workspace: z
      .literal(true)
      .meta({
        description:
          "`true`: on every machine its checkout lies beside the model's folder, in a folder of its `name`, as a workspace's clone script puts it. Read it there, and search it by naming that folder: a search begun above it skips a folder that an ignore file names. Left out when its place differs from one machine to the next: then it is one of the folders the session can read, or it is not in reach, and a skill says so.",
      })
      .optional(),
  })
  .meta({
    description:
      "A repository that holds code or deploy files of the system, other than the one the model's folder lies in: that one needs no record. A system or an app whose code is in it names it with `repository`; one that holds only deploy files or documents is named by none. It says which repository to read, and never where a checkout lies on a machine: no path, and no folder inside it. Written from a file that names the repository, as a clone script, a workspace's manifest or a package's own `repository`, or from a person's word; never from an image's name.",
  });

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
      .meta({ description: 'The id of an earlier step of this flow that names a connection, and not one that ends at a store: its answer travels back. An answer that comes back over several connections is a reply to each of their steps, the last first. Never with `does`.' })
      .optional(),
    after: ids('`after` holds the ids of earlier steps of this flow.')
      .meta({ description: 'The ids of earlier steps this one comes after, where that is not the step above. It comes after each of them that happens.' })
      .optional(),
    name: oneLine('name', NAME_MAX)
      .meta({
        description:
          'What happens, verb first: one line of 1 to 100 characters. Left out only where the name of the connection or of the flow in `does` says this step and no more. A reply always has one: it says what comes back. A step that happens once for each of several things says "each", as in `Weighs each tea of the order`. Where copies of one app take turns, it says which copy acts.',
      })
      .optional(),
    only: Only.optional(),
    description: prose(NOTE_MAX).meta({ description: 'A sentence or two of 1 to 300 characters: a wait, a retry, a refusal.' }).optional(),
    data: ids('`data` holds the ids of records in `data/`.')
      .meta({
        description:
          'The ids of the data this step passes, records in data/: on a step on a connection, or on a reply. A list with no id twice. On a step that writes a store it names what the step puts there; on one that reads a store, what the store holds: what the reader makes of it is named on the step that puts it somewhere.',
      })
      .optional(),
    access: z
      .enum(STEP_ACCESS)
      .meta({
        description:
          "Whether this step reads or writes the store its connection ends at: `read` or `write`. Only on a step whose connection says `access: read-write`; left out there, the store shows nothing of the step's `data`. A step that reads one thing and writes another is two steps.",
      })
      .optional(),
    removes: ids('`removes` holds the ids of records in `data/`.')
      .meta({
        description:
          'The ids of the data that is no longer in the store after this step, records in data/, none twice: on a step on a connection that ends at a store. A step that takes a job off a queue, so that no other worker gets it, names the job in `removes`, and in `data` too where the same step reads it. A read that leaves the thing there, as of a topic, names it in `data` alone.',
      })
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
  .meta({
    description:
      'One path through the model, told for one outcome: what starts it, the acts in order, each on a record the model holds, and what is true at the end. It has one start and tells one way. Another way to the same outcome is a flow of its own; where the ways part for a few steps only, each of those steps has `only`, and the step at which they meet names the last step of each in `after`.',
  });

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

/** The folders of the architecture that a rule chooses among: all but `repositories`, which a rule has no selector for. */
export const RECORD_FOLDERS = ['people', 'systems', 'apps', 'stores', 'components', 'connections', 'infrastructure', 'owners', 'technologies', 'features', 'flows', 'data'] as const;

/** The words of a selector's `kind`: a folder of the architecture, or a kind of app or of store. */
export const KIND_WORDS = [...RECORD_FOLDERS, ...APP_KINDS, ...STORE_KINDS] as const;

/** A rule's selector, as it is read. A list means "any of". */
export type Selector = {
  id?: string | string[];
  kind?: string | string[];
  within?: string | string[];
  not?: Selector;
  owner?: string | string[];
  technology?: string | string[];
  external?: boolean;
  only?: 'any' | 'none';
  name?: 'any' | 'none';
  description?: 'any' | 'none';
  opens?: 'to' | 'any' | 'none';
  access?: string | string[];
  from?: Selector;
  to?: Selector;
  via?: Selector | 'any' | 'none';
  connection?: Selector | 'any' | 'none';
  data?: string | string[];
};

/** What `never` or `each` holds: a selector, or the ways between two ends. An end left out is any thing. */
export type Subject = Selector & { way?: { from?: Selector; to?: Selector } };

/** What `must` holds: a selector, or, of a rule of ways, what each way passes. */
export type Must = Selector & { through?: Selector };

/** A value that may take more than one form: the message says every form, at the value's place. */
const forms = (field: string, what: string) => ({ error: (issue: { path?: readonly PropertyKey[] }) => `${subject(issue.path, field)} must be ${what}.` });

/** One id, or a list of them, in a selector. `holds` says what the value holds. */
function oneOrMany(field: string, holds: string) {
  return z.union([id(field, `holds ${holds}`), ids(`${quote(field)} holds ${holds}`)], forms(field, 'an id or a list of ids'));
}

/** One id, a list of them, or the word `any` or `none`. */
function idsOrWord(field: string, holds: string) {
  return z.union([z.enum(['any', 'none']), id(field, `holds ${holds}, or \`any\` or \`none\`.`), ids(`${quote(field)} holds ${holds}.`)], forms(field, '`any`, `none`, an id or a list of ids'));
}

const Present = z.enum(['any', 'none']);

/** The keys every selector has. `never` and `each` add `way` to them, and `must` adds `through`. */
const SelectorKeys = z.strictObject({
    id: oneOrMany('id', 'ids of records.').meta({ description: 'The record with this id, or one of these ids.' }).optional(),
    kind: z
      .union([z.enum(KIND_WORDS), z.array(z.enum(KIND_WORDS)).min(1)], forms('kind', `one of ${KIND_WORDS.map((word) => '`' + word + '`').join(', ')}, or a list of them`))
      .meta({ description: `A record of this folder, or whose own kind is this: ${KIND_WORDS.join(', ')}. A list means any of them.` })
      .optional(),
    within: oneOrMany('within', 'ids of people, systems, apps, stores, components or pieces of infrastructure.')
      .meta({ description: 'A thing with this id, and everything in it at any depth.' })
      .optional(),
    get not() {
      return SelectorSchema.optional().meta({ description: 'What the selector given here does not choose.' });
    },
    owner: idsOrWord('owner', 'ids of records in `owners/`')
      .meta({ description: 'A part or a feature with this owner: its own, or for a part that of the nearest thing it is in. `any`: it has one. `none`: it has none.' })
      .optional(),
    technology: idsOrWord('technology', 'ids of records in `technologies/`')
      .meta({ description: 'A part or a connection with one of these technologies of its own. `any`: it has one. `none`: it has none.' })
      .optional(),
    external: z.boolean().meta({ description: '`true`: an outside system, or a thing in one. `false`: any other thing.' }).optional(),
    only: Present.meta({ description: '`any`: it is there only under a condition, its own or that of what it is in. `none`: it is always there.' }).optional(),
    name: Present.meta({ description: '`any`: it has a name. `none`: it has none.' }).optional(),
    description: Present.meta({ description: '`any`: it has a description. `none`: it has none.' }).optional(),
    opens: z.enum(['to', 'any', 'none']).meta({ description: 'A connection whose far side opened the channel (`to` or `any`), or one that does not say so (`none`).' }).optional(),
    access: z
      .union([z.enum([...ACCESS, 'any', 'none']), z.array(z.enum(ACCESS)).min(1)], forms('access', '`read`, `write`, `read-write`, a list of them, `any` or `none`'))
      .meta({ description: 'A connection with this access to its store: read, write, read-write or a list of them. `any`: it has one. `none`: it has none.' })
      .optional(),
    get from() {
      return SelectorSchema.optional().meta({ description: 'A connection whose `from` is a thing this selector chooses.' });
    },
    get to() {
      return SelectorSchema.optional().meta({ description: 'A connection whose `to` is a thing this selector chooses.' });
    },
    get via() {
      return z
        .union([Present, SelectorSchema], forms('via', '`any`, `none` or a selector, a mapping'))
        .optional()
        .meta({ description: 'A connection with a hop in `via` that this selector chooses. `any`: it has a hop. `none`: it has none.' });
    },
    get connection() {
      return z
        .union([Present, SelectorSchema], forms('connection', '`any`, `none` or a selector, a mapping'))
        .optional()
        .meta({
          description: 'A thing that is an end of a connection this selector chooses: at `from` when it names only `to`, at `to` when it names only `from`, at either end otherwise. `any`: an end of some connection. `none`: of none.',
        });
    },
    data: idsOrWord('data', 'ids of records in `data/`')
      .meta({ description: 'A connection on which a step of a flow passes this data, or a reply to such a step does. `any`: some data. `none`: none.' })
      .optional(),
});

/** A selector has one key at least. A mapping with a key that is not known is not empty: that key is the problem. */
const NOT_EMPTY = {
  when: (payload: { issues: readonly unknown[] }) => payload.issues.length === 0,
  error: (issue: { path?: readonly PropertyKey[] }) =>
    `${subject(issue.path, 'selector')} is an empty mapping. A selector has at least one key. To mean any thing at an end of a way, leave that end out.`,
};
const notEmpty = (selector: object): boolean => Object.keys(selector).length > 0;

export const SelectorSchema: z.ZodType<Selector> = SelectorKeys.refine(notEmpty, NOT_EMPTY).meta({
  description: 'Chooses records of the other twelve folders. Every key given must hold; a list means any of its items; a key the kind of a record does not have does not match it.',
  minProperties: 1,
});

const WaySchema = z
  .strictObject({
    from: SelectorSchema.meta({ description: 'Where the way starts: a thing this selector chooses. Left out, any thing.' }).optional(),
    to: SelectorSchema.meta({ description: 'Where the way ends: a thing this selector chooses. Left out, any thing.' }).optional(),
  })
  // A way with a key that is not known is not without ends: that key is the problem.
  .refine((way) => way.from !== undefined || way.to !== undefined, {
    when: (payload) => payload.issues.length === 0,
    error: (issue) => `${subject(issue.path, 'way')} has neither \`from\` nor \`to\`. A way has one end at least; an end left out is any thing.`,
  })
  .meta({
    description: 'With no key beside it: the ways, connection after connection, from a thing `from` chooses to a thing `to` chooses. An end left out is any thing; one end at least.',
    minProperties: 1,
  });

/** What `never` and `each` hold: a selector, which may hold `way` and then nothing else. */
const SubjectSchema: z.ZodType<Subject> = SelectorKeys.extend({ way: WaySchema.optional() }).refine(notEmpty, NOT_EMPTY).meta({ minProperties: 1 });

/** What `must` holds: a selector, which of a rule of ways holds `through` and nothing else. */
const MustSchema: z.ZodType<Must> = SelectorKeys.extend({
  through: SelectorSchema.meta({ description: 'Of a rule of ways, with no key beside it: each way passes a thing this selector chooses, as an end, a thing between or a hop in `via`.' }).optional(),
})
  .refine(notEmpty, NOT_EMPTY)
  .meta({ minProperties: 1 });

/** A rule of a team's own: what must hold in its architecture, judged from the files alone. */
export const RuleSchema = z
  .strictObject({
    name: oneLine('name', SENTENCE_MAX).meta({ description: 'The rule in words: one sentence a person reads, on one line of 1 to 200 characters.' }),
    description: Description.meta({ description: 'Why it is a rule, in 1 to 2,000 characters.' }).optional(),
    never: SubjectSchema.meta({ description: 'Nothing this selector chooses may be in the model. Or `{way: {from, to}}`: no way leads from the one to the other. Never with `each` or `must`.' }).optional(),
    each: SubjectSchema.meta({ description: 'With `must`: each record this selector chooses also matches `must`. Or `{way: {from, to}}`: each such way passes `through` of `must`.' }).optional(),
    must: MustSchema.meta({ description: 'With `each`: what each record `each` chooses must match. Of a rule of ways, `{through: <selector>}`.' }).optional(),
    debt: ids('`debt` holds the ids of records that break the rule and stand for now.')
      .meta({ description: 'The ids of records that break the rule and stand for now; of a rule of ways, of connections a way does not go by. A list with no id twice.' })
      .optional(),
  })
  .meta({ description: "A rule of a team's own: a sentence, and a selector that `seefore check` judges against the other records. `never`, or `each` with `must`." });

/** The most characters of the prompt a change starts from: room for a full brief. */
export const PROMPT_MAX = 4000;
/** The most lines of `given`: the answers a person gave, when the change was drafted and when its review was answered; not the conversation. */
export const GIVEN_MAX = 15;
/** The most lines of `assumed`: a large change turns on more choices than a person is asked questions. */
export const ASSUMED_MAX = 15;
/** How a change is decided: its records are in the model's files, or the person said no. A change with neither is open. */
export const DECISIONS = ['applied', 'rejected'] as const;

/**
 * The lines of a change's input under the key `key`, as `given` and `assumed` hold them: each a
 * sentence or two on one line of 1 to 300 characters, 1 to `max` lines, none twice. `key` is
 * named in the messages.
 */
function inputLines(key: string, max: number) {
  const line = `A line of ${quote(key)}`;
  return z
    .array(
      z
        .string()
        .min(1, { error: `${line} is empty.` })
        .max(NOTE_MAX)
        .regex(ONE_LINE, {
          error: (issue) => {
            const text = String(issue.input);
            if (!/\S/.test(text)) return `${line} is empty.`;
            if (LINE_BREAK.test(text)) return `${line} must be on one line.`;
            return `${line} starts or ends with a space. Take the space off.`;
          },
        }),
    )
    .min(1)
    .max(max)
    .superRefine((lines, context) => {
      const seen = new Set<string>();
      lines.forEach((each, index) => {
        if (seen.has(each)) context.addIssue({ code: 'custom', path: [index], message: `${quote(key)} has the same line twice. Keep one.` });
        seen.add(each);
      });
    });
}

/**
 * A change, a file of `changes/`: its input, what a person brings before anything is drafted;
 * its body, the records it adds, updates and removes; and, once it is decided, its status.
 */
export const ChangeSchema = z
  .strictObject({
    name: Name.meta({ description: 'What the change is called: one line of 1 to 100 characters. It is written last, from the prompt and every answer.' }),
    prompt: z
      .string()
      .min(1, { error: '`prompt` is empty. It holds what the person asked for.' })
      .max(PROMPT_MAX)
      .regex(/\S/, { error: '`prompt` is empty. It holds what the person asked for.' })
      .meta({
        description:
          'What the person asked for, in 1 to 4,000 characters: as typed, or put into better words by the assistant with nothing added. It may be a line, a need or a full brief.',
      }),
    given: inputLines('given', GIVEN_MAX)
      .meta({
        description:
          "What the person answered when asked, each answer put into one line of 1 to 300 characters by the assistant: 1 to 15 lines, none twice. Nothing the prompt says already, and nothing the person did not say. Left out when nothing was asked.",
      })
      .optional(),
    assumed: inputLines('assumed', ASSUMED_MAX)
      .meta({
        description:
          'What the assistant chose without the person, each choice in one line of 1 to 300 characters with what would change it: 1 to 15 lines, none twice. A choice the person made is a line of `given`, never one of these. Left out when nothing was chosen unasked.',
      })
      .optional(),
    // The body. Each record in it is held by `change.ts`, at its place in the file: the shape of its folder, the model, and the model as it would be.
    add: z
      .record(z.string(), z.unknown())
      .meta({ description: 'The records the change adds: each under its path, `folder/id`, whole, as its own file would hold it. The id is one that no record has.' })
      .optional(),
    update: z
      .record(z.string(), z.unknown())
      .meta({
        description:
          'The records the change updates: under the path of each, `folder/id`, only the keys that change, each as it will be. `null` takes a key out. In `steps` of a flow, a step that stays as it is is named by its id alone.',
      })
      .optional(),
    remove: z
      .array(z.string())
      .min(1)
      .meta({ description: 'The records the change removes: the path of each, `folder/id`. What still names one of them is told by the check.' })
      .optional(),
    // The decision. That `why` goes with `status: rejected` alone is held by `change.ts`, which tells each way it fails with its own mend.
    status: z
      .enum(DECISIONS)
      .meta({
        description:
          "Whether the change is decided. Left out while it is open. `applied`: its records are in the model's files; written by `seefore apply` alone, never by hand. `rejected`: the person said no, and `why` says why. A decided change is history: the check holds its form alone and lays it over the model no more.",
      })
      .optional(),
    why: oneLine('why', NOTE_MAX).meta({ description: "With `status: rejected` alone: the person's reason for the no, in one line of 1 to 300 characters." }).optional(),
  })
  .meta({
    description:
      'A change: its input (the prompt a person gave, what they answered when asked, what the assistant chose without them, and a name written last), and its body, the records it adds, updates and removes. With no body it is an input alone. Once it is decided it bears `status`.',
    // `why` with `status: rejected` alone, and never a rejection without it, as the check holds it.
    if: { properties: { status: { const: 'rejected' } }, required: ['status'] },
    then: { required: ['why'] },
    else: { not: { required: ['why'] } },
  });

/** How heavy a point of a review is: a block must be answered, and a note waits for nobody. */
export const SEVERITIES = ['block', 'note'] as const;
/** Where a point of a review stands, and so who is next: the corrector, the reviewer or the person; after `closed` and `settled`, nobody. */
export const STATUSES = ['open', 'fixed', 'declined', 'closed', 'reopened', 'settled'] as const;
/** The most characters of the finding of a point. */
export const FINDING_MAX = 500;
/** The most addresses a point is about. */
export const ABOUT_MAX = 3;

const ID_TEXT = ID.source.slice(1, -1);
/** What a point is about: a record as `folder/id`, a step as `flows/<id>#<step>`, or the word `need`. */
const ABOUT = new RegExp(`^(?:need|(?:${CHANGED_FOLDERS.join('|')})/${ID_TEXT}|flows/${ID_TEXT}#${ID_TEXT})$`);

/** Text of 1 to `max` characters that is not blank, under the key `field`. */
function said(field: string, max: number) {
  return z
    .string()
    .min(1)
    .max(max)
    .regex(/\S/, { error: (issue) => `${subject(issue.path, field)} is empty.` });
}

/** One point of a review: one fault of the change, said by the reviewer, and what became of it. */
const PointSchema = z.strictObject({
  name: oneLine('name', NAME_MAX).meta({ description: 'The fault, as one sentence that reads alone: one line of 1 to 100 characters. No remedy and no word of severity.' }),
  severity: z.enum(SEVERITIES).meta({ description: '`block`: the point must be answered before the reading can end. `note`: nobody must answer it, and nothing waits for it.' }),
  about: z
    .array(z.string().regex(ABOUT, { error: 'An address in `about` is a record as `folder/id`, a step of a flow as `flows/<id>#<step>`, or the word `need`.' }))
    .min(1)
    .max(ABOUT_MAX)
    .superRefine((addresses, context) => {
      const seen = new Set<string>();
      addresses.forEach((address, index) => {
        if (seen.has(address)) context.addIssue({ code: 'custom', path: [index], message: '`about` has the same address twice. Keep one.' });
        seen.add(address);
      });
    })
    .meta({ description: 'Where to look: one to three addresses, the nearest first, none twice. A record is `folder/id`, a step of a flow `flows/<id>#<step>`, the need the word `need`.' }),
  finding: said('finding', FINDING_MAX).meta({ description: 'One fault, in 1 to 500 characters: what the records say, by their ids, and what goes wrong for whom. No remedy.' }),
  recommendation: said('recommendation', NOTE_MAX)
    .meta({ description: 'What must be true of the change for the point to close, in 1 to 300 characters; or a question for the person. An outcome, not a design. May be left out on a note.' })
    .optional(),
  status: z
    .enum(STATUSES)
    .meta({ description: 'Where the point stands. Left out, it is `open`. The corrector sets `fixed` or `declined`; the reviewer, at the second reading, `closed` or `reopened`. `settled`: the person said how a declined or reopened point ends, and their word is its next comment.' })
    .optional(),
  comments: z
    .array(oneLine('comment', NOTE_MAX))
    .min(1)
    .meta({ description: 'One line of 1 to 300 characters added at each change of status, by who changes it. No line is rewritten or taken out.' })
    .optional(),
});

/**
 * The review of a change: what a reader found in it. Its file is named by its change's id. With
 * no points, the reader found nothing, which is a full answer.
 */
export const ReviewSchema = z
  .strictObject({
    read: z
      .string()
      .regex(/^[0-9a-f]{8}$/, { error: '`read` is the mark of the change as it was read: eight characters, each a digit or a letter from a to f. Put it in quotes.' })
      .meta({ description: 'The mark of the change as it was read: eight characters, each a digit or a letter from a to f, in quotes.' }),
    // A point's id is held here and not as the shape of the key, so that a point with a wrong id has its own faults told too.
    points: z
      .record(z.string(), PointSchema)
      .refine((points) => Object.keys(points).length > 0, { error: '`points` is empty. Leave it out when nothing is found.' })
      .superRefine((points, context) => {
        for (const id of Object.keys(points)) {
          const wrong = idProblem(id);
          if (wrong !== undefined) context.addIssue({ code: 'custom', path: [id], message: `${wrong} A point's id is the key it stands under.` });
        }
      })
      .meta({ description: 'The points, each under its id, the weightiest first. Left out when nothing is found.' })
      .optional(),
  })
  .meta({ description: 'The review of a change, in a file named by the change\'s id: the mark of the change as it was read, and the points that the reader found.' });

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
  repositories: RepositorySchema,
  features: FeatureSchema,
  flows: FlowSchema,
  data: DataSchema,
  rules: RuleSchema,
  context: ContextSchema,
  changes: ChangeSchema,
  reviews: ReviewSchema,
} as const;

/** The marker `seefore.yaml`: the format, and the name of the model. */
export const MarkerSchema = z
  .strictObject({
    format: z.literal(1).meta({ description: 'The format of the files. It is 1.' }),
    name: oneLine('name', NAME_MAX).meta({ description: 'The name of the model: one line of 1 to 100 characters, with no space at either end.' }),
  })
  .meta({ description: 'The marker of a seefore model: the file seefore.yaml at the top of its folder.' });
