/** The nine kinds of record, in the order the page shows them: a folder each, with its words. */
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
] as const;
