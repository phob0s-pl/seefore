// The edits that `scripts/steady.mjs` makes to copies of a model, and the views it looks up in
// each. Each edit takes a model and gives an edited copy with the target it took, or undefined
// when the model has none for it. None changes the model it is given, and each picks its target
// from that model alone, never from a picture, so that a directory gets the same edits under any
// layout.
//
// How the targets are picked. The boxes, or the arrows, of the view that an edit can take are
// put in order of id, and four of them are taken, spread evenly over that order from its first
// to its last. Where an edit needs a second box, it is the next in that order after the first
// that the edit can take, or, for the last of the four, the last box outside. An edit that takes
// a target twice is tried once.
import { NAME_MAX, keyOf, viewsFor } from '../packages/core/src/index.ts';

/** How many targets each edit is tried at, spread over the order of id. */
export const TARGETS = 4;
/** How many connections, technologies and descriptions of each kind are renamed on a view. */
const SOME = 12;

/** A short name, and one as long as a name may be: words, with no space at either end. */
export const SHORT_NAME = 'Ab';
export const LONG_NAME = longName(NAME_MAX);

/** The description every edit that gives one gives. */
const DESCRIPTION = 'A new description, given for the trial of the layout. It has a second sentence.';

/** A name of exactly `length` characters, of words, that the format allows. */
function longName(length) {
  const words = 'A name as long as a name may be, made of words that go on '.repeat(Math.ceil(length / 40));
  const cut = words.slice(0, length).trimEnd();
  return cut + 'x'.repeat(length - cut.length);
}

/** Order of two ids, character by character. */
export function byText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

// The views of a model.

/** The views of each model, looked up once, each view made once. */
const lookups = new WeakMap();

/**
 * The views of a model, looked up once: what can be the scope, every setting, and for each
 * setting its view and the views above it, whose turns its picture takes. A view is made once
 * and kept while the model is.
 */
export function lookupOf(model) {
  let found = lookups.get(model);
  if (found === undefined) {
    const views = viewsFor(model);
    const made = new Map();
    const viewOf = (setting) => {
      const key = keyOf(setting);
      if (!made.has(key)) made.set(key, views.viewOf(setting));
      return made.get(key);
    };
    found = { scopes: views.scopes, settings: () => views.settings(), viewOf, aboveOf: (setting) => views.above(setting).map(viewOf) };
    lookups.set(model, found);
  }
  return found;
}

/** The view of a setting in a model and the views above it, or undefined when the model does not have the setting. */
export function settingIn(model, setting) {
  const lookup = lookupOf(model);
  const view = lookup.viewOf(setting);
  return view === undefined ? undefined : { view, above: lookup.aboveOf(setting) };
}

/**
 * The settings that are the two pictures of stage 5: each system at System depth, and each
 * system that opens at Container depth there. A system with nothing to open has no container
 * view of stage 5.
 */
export function stage5Of(model) {
  const lookup = lookupOf(model);
  return lookup.scopes
    .filter((scope) => scope.family === 'systems')
    .flatMap((scope) => {
      const container = { depth: 'container', scope: scope.id };
      return [{ depth: 'system', scope: scope.id }, ...((lookup.viewOf(container)?.boundaries.length ?? 0) > 0 ? [container] : [])];
    });
}

/**
 * The system whose container view of stage 5 has the most boxes, the first by id of those with
 * as many: the edits are made around it. Undefined when no system opens.
 */
export function largestOf(model) {
  const lookup = lookupOf(model);
  return stage5Of(model)
    .filter((setting) => setting.depth === 'container')
    .map((setting) => ({ scope: setting.scope, boxes: lookup.viewOf(setting).boxes.length }))
    .sort((a, b) => b.boxes - a.boxes || byText(a.scope, b.scope))[0]?.scope;
}

/**
 * The app whose components the edits of a component take, and which is chosen at Component
 * depth: the app with the most components, the first by id of those with as many. Undefined when
 * no app that can be the scope has a component.
 */
export function appWithComponents(model) {
  const apps = new Set(lookupOf(model).scopes.filter((scope) => scope.family === 'apps').map((scope) => scope.id));
  const counts = new Map();
  for (const component of model.components) if (apps.has(component.in)) counts.set(component.in, (counts.get(component.in) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || byText(a[0], b[0]))[0]?.[0];
}

/** The view of a kind of the system in scope, in a model: the context view at System depth, the container view at Container depth. */
function viewOf(model, scope, kind) {
  return lookupOf(model).viewOf({ depth: kind === 'context' ? 'system' : 'container', scope });
}

// Helpers of the edits.

const clone = (model) => structuredClone(model);
const FAMILIES = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

/** True for a box that stands inside the boundary of a container view. */
const isInside = (box) => box.boundary !== undefined;

/** The record of an element by its id, in any family that has a name. */
function recordOf(model, id) {
  for (const family of FAMILIES) {
    const found = model[family].find((record) => record.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

const isIn = (family) => (model, id) => model[family].some((record) => record.id === id);
const isStore = isIn('stores');
const isPerson = isIn('people');
const isApp = isIn('apps');

/** The ids of the boxes given, in order of id. */
function idsOf(boxes) {
  return boxes.map((box) => box.id).sort(byText);
}

/** The target `at` of four, spread evenly over items in order: the first, the last, and two between. */
function pick(items, at) {
  return items.length === 0 ? undefined : items[Math.round((at * (items.length - 1)) / (TARGETS - 1))];
}

/** The items after one of them, in order, and then those before it. */
function afterIn(items, item) {
  const at = items.indexOf(item);
  return [...items.slice(at + 1), ...items.slice(0, Math.max(at, 0))];
}

/** `count` items spread evenly over a list, from its first to its last. */
function spread(items, count) {
  if (items.length <= count) return [...items];
  if (count === 1) return [items[0]];
  return Array.from({ length: count }, (_, at) => items[Math.round((at * (items.length - 1)) / (count - 1))]);
}

/** An id that no record of the model has: the one wanted, or it with a number after. */
function freeId(model, wanted) {
  const taken = new Set(Object.values(model).flatMap((records) => records.map((record) => record.id)));
  for (let at = 1; ; at++) {
    const id = at === 1 ? wanted : `${wanted}-${at}`;
    if (!taken.has(id)) return id;
  }
}

/** The model with every family back in order of id, as `load` gives it. */
function tidy(model) {
  for (const family of Object.keys(model)) model[family].sort((a, b) => byText(a.id, b.id));
  return model;
}

/** A new connection of the name given, between two ends, on a model being edited. */
function connect(model, name, ends) {
  const id = freeId(model, 'new-connection');
  model.connections.push({ id, file: `connections/${id}.yaml`, name, ...ends });
}

/** True when an arrow of the view joins two boxes, either way. */
function joined(view, a, b) {
  return view.arrows.some((arrow) => (arrow.from === a && arrow.to === b) || (arrow.from === b && arrow.to === a));
}

/** A model less the records given, every connection at any of them, and each of them in a `via`. */
function withoutRecords(model, ids) {
  const next = clone(model);
  const gone = new Set(ids);
  for (const family of FAMILIES) next[family] = next[family].filter((record) => !gone.has(record.id));
  next.connections = next.connections.filter((each) => !gone.has(each.from) && !gone.has(each.to));
  for (const connection of next.connections) {
    if (connection.via === undefined) continue;
    const via = connection.via.filter((hop) => !gone.has(hop));
    if (via.length === 0) delete connection.via;
    else connection.via = via;
  }
  return next;
}

// The edits of the system with the largest container view. Each takes a model, that system and
// which of the four targets.

/** Each edit by its kind. */
export const EDITS = {
  /** A new app inside, which a box inside acts on, or which keeps a store, and which acts on the next box, or on the last box outside. */
  'add-app': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    if (view === undefined) return undefined;
    const inside = idsOf(view.boxes.filter(isInside));
    const outside = idsOf(view.boxes.filter((box) => !isInside(box)));
    const a = pick(inside, at);
    const b = at === TARGETS - 1 && outside.length > 0 ? outside.at(-1) : (afterIn(inside, a)[0] ?? outside.at(-1));
    if (a === undefined || b === undefined) return undefined;
    const next = clone(model);
    const id = freeId(next, 'new-thing');
    next.apps.push({ id, file: `apps/${id}.yaml`, name: 'New thing', in: scope, kind: 'service', description: 'A new app, added for the trial of the layout.' });
    connect(next, 'Asks the new thing', isStore(model, a) ? { from: id, to: a } : { from: a, to: id });
    connect(next, 'Tells of a result', isPerson(model, b) ? { from: b, to: id } : { from: id, to: b });
    return { target: a, model: tidy(next) };
  },
  /** An app inside taken out, with what is in it, the stores it keeps and every connection at any of them. */
  'remove-app': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && isApp(model, box.id))), at);
    if (app === undefined) return undefined;
    const held = [...model.components, ...model.stores].filter((record) => record.in === app).map((record) => record.id);
    return { target: app, model: tidy(withoutRecords(model, [app, ...held])) };
  },
  /** An app inside moved to another system: the first by id of those the view draws that are ours, else of those it draws, else of any. */
  'move-app': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && isApp(model, box.id))), at);
    if (app === undefined) return undefined;
    const drawn = idsOf(view.boxes.filter((box) => !isInside(box) && box.family === 'systems'));
    const ours = drawn.filter((id) => model.systems.find((system) => system.id === id)?.external !== true);
    const destination = ours[0] ?? drawn[0] ?? model.systems.map((system) => system.id).filter((id) => id !== scope).sort(byText)[0];
    if (destination === undefined) return undefined;
    const next = clone(model);
    const record = next.apps.find((each) => each.id === app);
    record.in = destination;
    return { target: app, model: tidy(next) };
  },
  /** A new store in the system, which an app inside writes. */
  'add-store': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && isApp(model, box.id))), at);
    if (app === undefined) return undefined;
    const next = clone(model);
    const id = freeId(next, 'new-store');
    next.stores.push({ id, file: `stores/${id}.yaml`, name: 'New store', in: scope, kind: 'database', description: 'A new store, added for the trial of the layout.' });
    connect(next, 'Writes the new store', { from: app, to: id });
    return { target: app, model: tidy(next) };
  },
  /** A store inside taken out, with every connection at it. */
  'remove-store': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const store = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && isStore(model, box.id))), at);
    if (store === undefined) return undefined;
    return { target: store, model: tidy(withoutRecords(model, [store])) };
  },
  /** A connection between a box inside and the next box inside that has no arrow to it, from the one that is not a store. */
  'add-connection': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    if (view === undefined) return undefined;
    const inside = idsOf(view.boxes.filter(isInside));
    const a = pick(inside, at);
    const b = a === undefined ? undefined : afterIn(inside, a).find((id) => !joined(view, a, id) && !(isStore(model, a) && isStore(model, id)));
    if (b === undefined) return undefined;
    const next = clone(model);
    connect(next, 'Asks for a new thing', isStore(model, a) ? { from: b, to: a } : { from: a, to: b });
    return { target: a, model: tidy(next) };
  },
  /** The first connection, by id, of an arrow of the container view, taken out. */
  'remove-connection': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    return view === undefined ? undefined : withoutConnectionOf(model, view, at);
  },
  /** A new system outside, which a box inside that is not a store acts on. */
  'add-neighbour': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const a = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && !isStore(model, box.id))), at);
    if (a === undefined) return undefined;
    const next = clone(model);
    const id = freeId(next, 'new-system');
    next.systems.push({ id, file: `systems/${id}.yaml`, name: 'New system', external: true, description: 'A new system outside, added for the trial of the layout.' });
    connect(next, 'Asks the new system', { from: a, to: id });
    return { target: a, model: tidy(next) };
  },
  /** In the context view, a connection the other way between the system and a neighbour that has an arrow one way only. */
  'add-connection-outside': (model, scope, at) => {
    const view = viewOf(model, scope, 'context');
    if (view === undefined) return undefined;
    const between = (id) => view.arrows.filter((arrow) => (arrow.from === scope && arrow.to === id) || (arrow.from === id && arrow.to === scope));
    const oneWay = idsOf(view.boxes.filter((box) => !box.scope && box.family !== 'people' && box.family !== 'stores' && between(box.id).length === 1));
    const id = pick(oneWay, at);
    if (id === undefined) return undefined;
    const outward = between(id)[0]?.from === scope;
    const next = clone(model);
    connect(next, 'Asks for a new thing', outward ? { from: id, to: scope } : { from: scope, to: id });
    return { target: id, model: tidy(next) };
  },
  /** The first connection, by id, of an arrow of the context view, taken out. */
  'remove-connection-outside': (model, scope, at) => {
    const view = viewOf(model, scope, 'context');
    return view === undefined ? undefined : withoutConnectionOf(model, view, at);
  },
  /** A box inside given a name as long as a name may be: the last of the edits made together. */
  rename: (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const id = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => isInside(box) && recordOf(model, box.id) !== undefined)), at);
    if (id === undefined) return undefined;
    const next = clone(model);
    recordOf(next, id).name = LONG_NAME;
    return { target: id, model: next };
  },
};

/** The model less the first connection, by id, of the arrow `at` of a view, the arrows in order of id. */
function withoutConnectionOf(model, view, at) {
  const arrow = pick([...view.arrows].sort((a, b) => byText(a.id, b.id)), at);
  const id = arrow === undefined ? undefined : [...arrow.connections].sort(byText).find((each) => model.connections.some((connection) => connection.id === each));
  if (id === undefined) return undefined;
  const next = clone(model);
  next.connections = next.connections.filter((connection) => connection.id !== id);
  return { target: arrow.id, model: next };
}

/** The edits tried one at a time. */
const SINGLE = ['add-app', 'remove-app', 'move-app', 'add-store', 'remove-store', 'add-connection', 'remove-connection', 'add-neighbour', 'add-connection-outside', 'remove-connection-outside'];

/**
 * The edits that add something. The floor of the worst edit in a column is for these. An edit
 * that takes something out, or moves an app or a component, may take away a box that the walk
 * passes early: the walk then reaches the rest another way, and no order taken from the arrows
 * holds through that. The worst of those is printed beside, and has no floor.
 */
export const ADDS = new Set(['add-app', 'add-store', 'add-connection', 'add-neighbour', 'add-connection-outside', 'add-component']);

/** The five edits made together, each with the target it takes. */
export const TOGETHER = [
  ['remove-app', TARGETS - 1],
  ['add-app', 0],
  ['add-connection', TARGETS - 1],
  ['add-neighbour', 0],
  ['rename', 1],
];

/** Every edit of a kind at each of its targets, a target once. */
function eachAt(kinds, edits, ...given) {
  const found = [];
  for (const kind of kinds) {
    const targets = new Set();
    for (let at = 0; at < TARGETS; at++) {
      const edit = edits[kind](...given, at);
      if (edit === undefined || targets.has(edit.target)) continue;
      targets.add(edit.target);
      found.push({ kind, at, model: edit.model });
    }
  }
  return found;
}

/** Every edit tried one at a time on the model, around the system given. */
export function singleEdits(model, scope) {
  return eachAt(SINGLE, EDITS, model, scope);
}

// The edits of a component. Each takes a model, the app with the most components and which of
// the four targets, which are its components in order of id.

/** The components of an app, in order of id. */
function componentsOf(model, app) {
  return model.components.filter((component) => component.in === app).map((component) => component.id).sort(byText);
}

/** Each edit of a component by its kind. */
const COMPONENT_EDITS = {
  /** A new component in the app, which the target acts on. */
  'add-component': (model, app, at) => {
    const target = pick(componentsOf(model, app), at);
    if (target === undefined) return undefined;
    const next = clone(model);
    const id = freeId(next, 'new-component');
    next.components.push({ id, file: `components/${id}.yaml`, name: 'New component', in: app, description: 'A new component, added for the trial of the layout.' });
    connect(next, 'Asks the new component', { from: target, to: id });
    return { target, model: tidy(next) };
  },
  /** A component taken out, with every connection at it and wherever a `via` names it. */
  'remove-component': (model, app, at) => {
    const target = pick(componentsOf(model, app), at);
    if (target === undefined) return undefined;
    return { target, model: tidy(withoutRecords(model, [target])) };
  },
  /** A component moved to another app: the first by id of the others in the app's system, else of any. */
  'move-component': (model, app, at) => {
    const target = pick(componentsOf(model, app), at);
    const system = model.apps.find((each) => each.id === app)?.in;
    const others = model.apps.filter((each) => each.id !== app).sort((a, b) => byText(a.id, b.id));
    const destination = (others.find((each) => each.in === system) ?? others[0])?.id;
    if (target === undefined || destination === undefined) return undefined;
    const next = clone(model);
    next.components.find((each) => each.id === target).in = destination;
    return { target, model: tidy(next) };
  },
};

/** Every edit of a component tried one at a time on the model, of the components of the app given. */
export function componentEdits(model, app) {
  return eachAt(Object.keys(COMPONENT_EDITS), COMPONENT_EDITS, model, app);
}

// New words.

/** A record given a name, or a new description. */
function withText(id, key, text) {
  return (model) => {
    const next = clone(model);
    const record = recordOf(next, id) ?? next.connections.find((each) => each.id === id) ?? next.technologies.find((each) => each.id === id);
    record[key] = text;
    return next;
  };
}

/**
 * Every rename and description to try on a view, each with its kind and the edit. Each thing is
 * renamed twice: to a short name, and to one as long as a name may be.
 */
export function renamesOf(model, view) {
  const named = new Set([...view.boxes.map((box) => box.id), view.scope, ...view.passed.map((each) => each.id)]);
  const targets = [...named].filter((id) => id !== null && recordOf(model, id) !== undefined).sort(byText);
  // Connections, alone on an arrow and among several.
  const connections = (alone) => view.arrows.filter((arrow) => (arrow.connections.length === 1) === alone).flatMap((arrow) => arrow.connections).filter((id) => model.connections.some((each) => each.id === id)).sort(byText);
  targets.push(...spread(connections(true), SOME), ...spread(connections(false), SOME));
  // Technologies that an arrow of the view names.
  const shown = new Set(view.arrows.flatMap((arrow) => arrow.technology));
  targets.push(...spread(model.technologies.filter((each) => shown.has(each.name)).map((each) => each.id).sort(byText), SOME));
  const tries = targets.flatMap((id) => [SHORT_NAME, LONG_NAME].map((name) => ({ kind: 'name', edit: withText(id, 'name', name) })));
  // A new description, for boxes spread over the view.
  const described = spread(idsOf(view.boxes).filter((id) => recordOf(model, id) !== undefined), SOME);
  tries.push(...described.map((id) => ({ kind: 'description', edit: withText(id, 'description', DESCRIPTION) })));
  return tries;
}

/** The families whose names a picture says: its boxes and boundaries, its connections, what they pass through, and their technologies. */
const NAMED = [...FAMILIES, 'connections', 'technologies'];

/**
 * The model with new words everywhere at once, each with what it is: every name that is given,
 * short; every such name as long as a name may be; and a new description for every person,
 * system, app, store, component and piece of infrastructure, which had one or not. A connection
 * with no name keeps none.
 */
export const WORDS = [
  { what: 'every name short', edit: (model) => withEvery(model, NAMED, (record) => (record.name === undefined ? {} : { name: SHORT_NAME })) },
  { what: 'every name as long as a name may be', edit: (model) => withEvery(model, NAMED, (record) => (record.name === undefined ? {} : { name: LONG_NAME })) },
  { what: 'every description new', edit: (model) => withEvery(model, FAMILIES, () => ({ description: DESCRIPTION })) },
];

/** A copy of the model with what `change` gives set on every record of the families given. */
function withEvery(model, families, change) {
  const next = clone(model);
  for (const family of families) for (const record of next[family]) Object.assign(record, change(record));
  return next;
}
