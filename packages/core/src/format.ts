import type { z } from 'zod';
import {
  AppSchema,
  ComponentSchema,
  InfrastructureSchema,
  ConnectionSchema,
  OwnerSchema,
  PersonSchema,
  StoreSchema,
  SystemSchema,
  TechnologySchema,
} from './records.ts';

/** A field of a record that names another record by its id. */
export interface ReferenceField {
  /** The key, such as `in`. */
  field: string;
  /** The folders of the families whose records it may name. */
  families: readonly string[];
  /** True when the field holds a list of ids, as `technology` does, and not one id. */
  list?: boolean;
  /** The rule in plain words, said with every problem of this field. */
  rule: string;
  /**
   * What to do when the field names a record of a family it may not name, by that family. It is
   * said after the rule, for a slip the rule alone would not mend.
   */
  wrongFamily?: Readonly<Record<string, string>>;
}

/** What the records of a family hold, and what they may name. */
export interface RecordKind {
  /** What one record is called, as in `app`. */
  noun: string;
  /** The noun with its article, as in `an app`. */
  one: string;
  /** The shape of its file. */
  schema: z.ZodType;
  /** The fields that name other records. */
  references: readonly ReferenceField[];
}

/** A family of records: one folder under the top of a source directory. */
export interface Family {
  /** The folder's name, such as `apps`. */
  folder: string;
  /**
   * What its records hold. A family without it is read, and its records are held to no shape;
   * tests use such families to try the rules of the source directory by themselves.
   */
  record?: RecordKind;
}

/** What a source directory of one format version may hold. */
export interface Format {
  version: number;
  families: readonly Family[];
}

/** The families a connection may start or end at: the elements of the model. */
const ELEMENTS = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

const OWNER: ReferenceField = { field: 'owner', families: ['owners'], rule: '`owner` names an owner, a record in `owners/`.' };

const TECHNOLOGY: ReferenceField = {
  field: 'technology',
  families: ['technologies'],
  list: true,
  rule: 'Each id in `technology` names a technology, a record in `technologies/`.',
};

/** What a connection passes through. A store is not one: a put and a take are two connections. */
const VIA: ReferenceField = {
  field: 'via',
  families: ['infrastructure', 'apps', 'components', 'systems'],
  list: true,
  rule: 'Each id in `via` names a piece of infrastructure, an app, a component or a system: something this exchange passes through.',
  wrongFamily: {
    stores:
      'A store is never passed through, and a queue or a topic is a store: write a connection to it from the one that puts in, ' +
      'and another from the one that takes out, in place of this one.',
  },
};

/**
 * Format 1: nine families of records. The order is the order a listing shows them in: who
 * uses the software, the software from the outside in, how it is connected, and the two
 * families that the others name. What `in` may name keeps anything from coming to be in
 * itself: an app is in a system, a store in a system or an app, a component in an app, and a
 * piece of infrastructure in a system or in none. Nothing is in a store, a component or a piece
 * of infrastructure.
 */
export const FORMAT_1: Format = {
  version: 1,
  families: [
    { folder: 'people', record: { noun: 'person', one: 'a person', schema: PersonSchema, references: [] } },
    { folder: 'systems', record: { noun: 'system', one: 'a system', schema: SystemSchema, references: [OWNER] } },
    {
      folder: 'apps',
      record: {
        noun: 'app',
        one: 'an app',
        schema: AppSchema,
        references: [{ field: 'in', families: ['systems'], rule: 'An app is in a system.' }, TECHNOLOGY, OWNER],
      },
    },
    {
      folder: 'stores',
      record: {
        noun: 'store',
        one: 'a store',
        schema: StoreSchema,
        references: [
          {
            field: 'in',
            families: ['systems', 'apps'],
            rule: 'A store is in a system, or in the app that keeps it.',
            // The way out of the case convention 10 decides: which server holds what is a matter of deployment.
            wrongFamily: {
              stores:
                'A store is never in a store. Databases on one server are each a store in the system, and each description names the server. ' +
                'A queue kept as rows is a store of its own in the system, with the database named in its description.',
            },
          },
          TECHNOLOGY,
          OWNER,
        ],
      },
    },
    {
      folder: 'components',
      record: {
        noun: 'component',
        one: 'a component',
        schema: ComponentSchema,
        references: [{ field: 'in', families: ['apps'], rule: 'A component is in an app.' }, TECHNOLOGY, OWNER],
      },
    },
    {
      folder: 'infrastructure',
      record: {
        noun: 'piece of infrastructure',
        one: 'a piece of infrastructure',
        schema: InfrastructureSchema,
        references: [{ field: 'in', families: ['systems'], rule: 'A piece of infrastructure is in a system, or in none.' }, TECHNOLOGY, OWNER],
      },
    },
    {
      folder: 'connections',
      record: {
        noun: 'connection',
        one: 'a connection',
        schema: ConnectionSchema,
        references: [
          { field: 'from', families: ELEMENTS, rule: 'A connection goes from a person, a system, an app, a store, a component or a piece of infrastructure.' },
          { field: 'to', families: ELEMENTS, rule: 'A connection goes to a person, a system, an app, a store, a component or a piece of infrastructure.' },
          VIA,
          TECHNOLOGY,
        ],
      },
    },
    { folder: 'owners', record: { noun: 'owner', one: 'an owner', schema: OwnerSchema, references: [] } },
    { folder: 'technologies', record: { noun: 'technology', one: 'a technology', schema: TechnologySchema, references: [] } },
  ],
};

/** The format this seefore writes and reads. */
export const CURRENT_FORMAT: Format = FORMAT_1;

/** Every format version this seefore can read. */
export const READABLE_VERSIONS: readonly number[] = [1];

/** The family whose folder this is, if the format has one. */
export function familyIn(format: Format, folder: string): Family | undefined {
  return format.families.find((family) => family.folder === folder);
}

/** What one record of a family is called, as in `app`. */
export function nounOf(format: Format, folder: string): string {
  return familyIn(format, folder)?.record?.noun ?? `record in \`${folder}/\``;
}

/** What one record of a family is called, with its article, as in `an app`. */
export function oneOf(format: Format, folder: string): string {
  return familyIn(format, folder)?.record?.one ?? `a record in \`${folder}/\``;
}

/** A field of a family that names other records, if it is one. */
export function referenceField(format: Format, folder: string, field: string): ReferenceField | undefined {
  return familyIn(format, folder)?.record?.references.find((reference) => reference.field === field);
}
