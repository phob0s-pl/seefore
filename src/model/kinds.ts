/**
 * The fourteen kinds of record, a folder each, with its words. The first twelve are the
 * architecture, in the order the page shows them. The thirteenth, `rules`, holds the rules of a
 * team's own, which choose among the twelve. The fourteenth, `context`, holds what is true of
 * the whole model, or of one system, and that no record of the architecture says.
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
] as const;

/** Whether a folder holds records of the architecture: every folder but `rules` and `context`. */
export const ofArchitecture = (kind: string): boolean => kind !== 'rules' && kind !== 'context';

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
};

/** What one record of each folder is called where the record itself is meant: "`colour` is not a key of a data record". */
export const RECORD_NOUNS: Record<string, string> = { ...NOUNS, data: 'a data record' };
