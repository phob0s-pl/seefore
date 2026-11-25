/**
 * The fifteen kinds of record, a folder each, with its words. The first twelve are the
 * architecture, in the order the page shows them. The thirteenth, `rules`, holds the rules of a
 * team's own, which choose among the twelve. The fourteenth, `context`, holds what is true of
 * the whole model, or of one system, and that no record of the architecture says. The
 * fifteenth, `changes`, holds what is proposed: the records a change adds, updates and removes.
 */
export const KINDS = [
  { folder: 'people', one: 'person', many: 'people' },
  { folder: 'systems', one: 'system', many: 'systems' },
  { folder: 'apps', one: 'app', many: 'apps' },
  { folder: 'stores', one: 'store', many: 'stores' },
  { folder: 'components', one: 'component', many: 'components' },
  { folder: 'connections', one: 'connection', many: 'connections' },
  { folder: 'infrastructure', one: 'piece of infrastructure', many: 'pieces of infrastructure' },
  { folder: 'owners', one: 'owner', many: 'owners' },
  { folder: 'technologies', one: 'technology', many: 'technologies' },
  { folder: 'features', one: 'feature', many: 'features' },
  { folder: 'flows', one: 'flow', many: 'flows' },
  { folder: 'data', one: 'data record', many: 'data records' },
  { folder: 'rules', one: 'rule', many: 'rules' },
  { folder: 'context', one: 'line of context', many: 'lines of context' },
  { folder: 'changes', one: 'change', many: 'changes' },
] as const;

/** Whether a folder holds records of the architecture: every folder but `rules`, `context` and `changes`. */
export const ofArchitecture = (kind: string): boolean => kind !== 'rules' && kind !== 'context' && kind !== 'changes';

/** The folders whose records a change may add, update or remove: every folder but its own. */
export const CHANGED_FOLDERS: readonly string[] = KINDS.map((kind) => kind.folder).filter((folder) => folder !== 'changes');

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
};

/** What one record of each folder is called where the record itself is meant: "`colour` is not a key of a data record". */
export const RECORD_NOUNS: Record<string, string> = { ...NOUNS, data: 'a data record' };
