/**
 * The sixteen kinds of record, a folder each, with its words. The first twelve are the
 * architecture, in the order the page shows them. The thirteenth, `rules`, holds the rules of a
 * team's own, which choose among the twelve. The fourteenth, `context`, holds what is true of
 * the whole model, or of one system, and that no record of the architecture says. The
 * fifteenth, `changes`, holds what is proposed: the records a change adds, updates and removes.
 * The sixteenth, `reviews`, holds what a reader found in a change: a file for each change.
 *
 * `word` is the first word of the id of every record of the folder, as `app` in `app-gateway`:
 * an id says its kind. A change and a review have none: they are no records of the model.
 */
export const KINDS = [
  { folder: 'people', one: 'person', many: 'people', word: 'person' },
  { folder: 'systems', one: 'system', many: 'systems', word: 'system' },
  { folder: 'apps', one: 'app', many: 'apps', word: 'app' },
  { folder: 'stores', one: 'store', many: 'stores', word: 'store' },
  { folder: 'components', one: 'component', many: 'components', word: 'component' },
  { folder: 'connections', one: 'connection', many: 'connections', word: 'connection' },
  { folder: 'infrastructure', one: 'piece of infrastructure', many: 'pieces of infrastructure', word: 'infra' },
  { folder: 'owners', one: 'owner', many: 'owners', word: 'owner' },
  { folder: 'technologies', one: 'technology', many: 'technologies', word: 'tech' },
  { folder: 'features', one: 'feature', many: 'features', word: 'feature' },
  { folder: 'flows', one: 'flow', many: 'flows', word: 'flow' },
  { folder: 'data', one: 'data record', many: 'data records', word: 'data' },
  { folder: 'rules', one: 'rule', many: 'rules', word: 'rule' },
  { folder: 'context', one: 'line of context', many: 'lines of context', word: 'context' },
  { folder: 'changes', one: 'change', many: 'changes' },
  { folder: 'reviews', one: 'review', many: 'reviews' },
] as const;

/** The first word of an id in each folder of the model, as `apps` to `app`. */
export const WORDS: Readonly<Record<string, string>> = Object.fromEntries(KINDS.flatMap((kind) => ('word' in kind ? [[kind.folder, kind.word]] : [])));

/** The folder whose word an id begins with, as `app-gateway` to `apps`; nothing for an id with no folder's word, or with nothing after it. */
export function folderOfId(id: string): string | undefined {
  return Object.keys(WORDS).find((folder) => id.startsWith(`${WORDS[folder]}-`) && id.length > `${WORDS[folder]}-`.length);
}

/** Whether a folder holds records of the architecture: every folder but `rules`, `context`, `changes` and `reviews`. */
export const ofArchitecture = (kind: string): boolean => kind !== 'rules' && kind !== 'context' && kind !== 'changes' && kind !== 'reviews';

/** Whether a folder holds records of the model: all but what is proposed and what was found in it. Such a file is named by a change's id, which is its own. */
export const ofModel = (kind: string): boolean => kind !== 'changes' && kind !== 'reviews';

/** The folders whose records a change may add, update or remove: every folder of the model. */
export const CHANGED_FOLDERS: readonly string[] = KINDS.map((kind) => kind.folder).filter(ofModel);

/** What each folder's records are called in a message, with their article. */
export const NOUNS: Record<string, string> = {
  people: 'a person',
  systems: 'a system',
  apps: 'an app',
  stores: 'a store',
  components: 'a component',
  connections: 'a connection',
  infrastructure: 'a piece of infrastructure',
  owners: 'an owner',
  technologies: 'a technology',
  features: 'a feature',
  flows: 'a flow',
  data: 'data',
  rules: 'a rule',
  context: 'a line of context',
  changes: 'a change',
  reviews: 'a review',
};

/** What one record of each folder is called where the record itself is meant: "`colour` is not a key of a data record". */
export const RECORD_NOUNS: Record<string, string> = { ...NOUNS, data: 'a data record' };
