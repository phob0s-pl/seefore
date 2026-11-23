// Tries how steady the layout is on source directories, for the trial of a stage: whether the
// same model gives the same picture, whether a new name or description moves nothing, and how
// much of the order one edit keeps. It is run by hand, not by `npm run check`, since it takes
// minutes on the trial models. It is not part of the installed command.
//
//   node scripts/steady.mjs <directory> [<directory> ...] [--json]
//
// It runs from the repository's root with no build: it reads the sources of the core library,
// the command and the layout, and Node strips their types itself, as it does for the tests.
// Each layout runs in a worker thread of the layout package under its time limit, as the
// server runs it.
//
// For each directory it lays out every view twice, and once more with the files read in the
// opposite order, the boxes and arrows handed over shuffled, in another thread. Then it edits
// a copy of the model in memory and compares the pictures of the context view and the
// container view of the system with the largest container view: a new name for every box and
// every thing on a route, for connections and technologies, and a new description; an app
// added, taken out or moved to another system, a connection added and a new system outside,
// each at four boxes from the middle of the picture to its edge; and five edits together.
//
// It prints one row for each directory and one for all, then each pass number of
// `docs/layout.md` with "passes" or "fails", and ends with exit code 1 when one fails. With
// `--json` it prints the same as data. It prints counts and shares only, never a name or an id
// from a model, so that its table can be shown for a model that is not public.
import { basename, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { CROWDED_FROM, load, viewsOf } from '../packages/core/src/index.ts';
import { isDirectory, readSourceFiles } from '../packages/cli/src/directory.ts';
import { LAYOUT_LIMIT, startRunner } from '../packages/layout/src/node.ts';
import { BOX_HEIGHT, BOX_WIDTH } from '../packages/layout/src/sizes.ts';
import { change, crossings, placesOf } from '../packages/layout/test/change.ts';

const { values, positionals } = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean', default: false } } });
if (positionals.length === 0) {
  console.error('usage: node scripts/steady.mjs <directory> [<directory> ...] [--json]');
  process.exit(2);
}
for (const each of positionals) {
  if (isDirectory(resolve(each))) continue;
  console.error(`${each} is not a folder. Give the source directory of a model.`);
  process.exit(2);
}

/** How many boxes each edit is tried at, from the middle of the picture to its edge. */
const TARGETS = 4;
/** How many connections, technologies and descriptions of each kind are tried on a view. */
const SOME = 12;
/** The pass numbers of `docs/layout.md`, "What must be true". */
const PASS = { column: 0.95, columnWorst: 0.75, pairs: 0.8, pairsEachModel: 0.65, context: 0.8, slowest: 2000 };

const WORKER = new URL('../packages/layout/src/worker.ts', import.meta.url);
/** The runner for each first and second layout, and one in another thread for the shuffled. */
const runner = startRunner({ worker: WORKER, limit: LAYOUT_LIMIT });
const other = startRunner({ worker: WORKER, limit: LAYOUT_LIMIT });

/** Tries every directory, prints what it found, and ends with the exit code of the pass numbers. */
async function main() {
  const directories = positionals.map((each) => resolve(each));
  const labels = labelsOf(directories);
  const results = [];
  try {
    // A thread starts and loads ELK with its first layout: that time is not the layout's.
    const warm = { id: 'warm.context', kind: 'context', scope: 'warm', title: '', boxes: [], arrows: [], left: { outside: [], broken: [] }, legend: [], passed: [] };
    await runner.layOut(warm);
    await other.layOut(warm);
    for (const [at, directory] of directories.entries()) {
      process.stderr.write(`${labels[at]}: laying out\n`);
      results.push(await tryDirectory(directory, labels[at]));
    }
  } finally {
    await runner.close();
    await other.close();
  }
  const all = summaryOf(results);
  const passes = passesOf(results, all);
  if (values.json) console.log(JSON.stringify({ directories: results, all, passes }, null, 1));
  else print(results, all, passes);
  process.exit(passes.every((each) => each.passes) ? 0 : 1);
}

/** The shortest end of each path that tells it from the others: `shop/architecture`. */
function labelsOf(paths) {
  const parts = paths.map((path) => path.split(sep).filter((part) => part !== ''));
  return parts.map((mine) => {
    for (let take = 1; take <= mine.length; take++) {
      const label = mine.slice(-take).join('/');
      if (parts.filter((each) => each.slice(-take).join('/') === label).length === 1) return label;
    }
    return mine.join('/') || basename(sep);
  });
}

/** The model of a source directory, from its files in their order or in the opposite one. */
function modelOf(directory, reverse = false) {
  const read = readSourceFiles(directory);
  const files = reverse ? [...read.files].reverse() : read.files;
  return load(files);
}

/** What the layouts of the directory under way came to: the slowest, and how many were not drawn. */
const clock = { slowestMs: 0, failed: 0 };

/**
 * The picture of a view, or undefined when it was not drawn, and how long it took in
 * milliseconds. One layout is asked for at a time, so the time is the layout's own.
 */
async function timed(view, by = runner) {
  const started = performance.now();
  const picture = await by.layOut(view);
  const ms = performance.now() - started;
  clock.slowestMs = Math.max(clock.slowestMs, ms);
  if ('failed' in picture) clock.failed += 1;
  return { drawn: 'failed' in picture ? undefined : picture, ms };
}

/** The picture of a view, or undefined when it was not drawn. */
async function drawnOf(view, by = runner) {
  return (await timed(view, by)).drawn;
}

/** The items in a fixed shuffle, so that a run can be made again. */
function shuffled(items, seed) {
  const out = [...items];
  let state = seed;
  const next = () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
  for (let at = out.length - 1; at > 0; at--) {
    const to = Math.floor(next() * (at + 1));
    [out[at], out[to]] = [out[to], out[at]];
  }
  return out;
}

/** Everything the script measures on one source directory. */
async function tryDirectory(directory, label) {
  const loaded = modelOf(directory);
  const model = loaded.model;
  const views = viewsOf(model);
  const reversed = new Map(viewsOf(modelOf(directory, true).model).map((view) => [view.id, view]));
  clock.slowestMs = 0;
  clock.failed = 0;
  const result = {
    label,
    views: views.length,
    differAgain: 0,
    differInOrder: 0,
    /** Layouts that were not drawn, of any view, edited or not. */
    failed: 0,
    /** The slowest of every layout the script made of this directory. */
    slowestMs: 0,
    crowded: { views: views.filter((view) => view.boxes.length > CROWDED_FROM).length, reported: loaded.problems.filter((problem) => problem.code === 'view-crowded').length },
    renames: { tried: 0, moved: 0 },
    descriptions: { tried: 0, moved: 0 },
    containers: undefined,
    context: undefined,
    together: undefined,
    main: undefined,
    notes: [],
  };
  if (views.length === 0) result.notes.push('it has no view');

  const finish = () => {
    result.slowestMs = clock.slowestMs;
    result.failed = clock.failed;
    return result;
  };

  // The same model, laid out again, and in another order in another thread.
  const first = new Map();
  const firstMs = new Map();
  for (const view of views) {
    const once = await timed(view);
    const again = await drawnOf(view);
    const turned = reversed.get(view.id);
    const mixed = turned === undefined ? undefined : await drawnOf({ ...turned, boxes: shuffled(turned.boxes, 7), arrows: shuffled(turned.arrows, 11) }, other);
    if (once.drawn === undefined) continue;
    first.set(view.id, once.drawn);
    firstMs.set(view.id, once.ms);
    if (JSON.stringify(again) !== JSON.stringify(once.drawn)) result.differAgain += 1;
    if (JSON.stringify(mixed) !== JSON.stringify(once.drawn)) result.differInOrder += 1;
  }

  const containerView = views.filter((view) => view.kind === 'containers').sort((a, b) => b.boxes.length - a.boxes.length)[0];
  if (containerView === undefined) {
    result.notes.push('it has no container view, so no edit is tried');
    return finish();
  }
  const scope = containerView.scope;
  const contextView = views.find((view) => view.id === `${scope}.context`);
  const containers = first.get(containerView.id);
  const context = contextView === undefined ? undefined : first.get(contextView.id);
  if (containers === undefined || context === undefined) {
    result.notes.push('its main views were not drawn, so no edit is tried');
    return finish();
  }
  const main = [
    { view: containerView, drawn: containers },
    { view: contextView, drawn: context },
  ];
  result.main = {
    crossings: main.reduce((sum, each) => sum + crossings(each.drawn), 0),
    area: main.reduce((sum, each) => sum + each.drawn.width * each.drawn.height, 0),
    slowestMs: Math.max(...main.map((each) => firstMs.get(each.view.id) ?? 0)),
  };

  // A new name or a new description: nothing but the words may change.
  for (const { view, drawn } of main) {
    const was = placesOf(drawn);
    for (const rename of renamesOf(model, view)) {
      const edited = viewsOf(rename.edit(model)).find((each) => each.id === view.id);
      if (edited === undefined) continue;
      const after = await drawnOf(edited);
      const into = rename.kind === 'description' ? result.descriptions : result.renames;
      into.tried += 1;
      if (after === undefined || placesOf(after) !== was) into.moved += 1;
    }
  }

  // One edit at a time, and five together. An edit whose view was not drawn is counted as not drawn, and not measured.
  const edits = editsFor(model, scope, main[1], main[0]);
  const rows = { containers: [], context: [] };
  for (const edit of edits) {
    const edited = viewsOf(edit.edit(model));
    for (const kind of edit.views) {
      const before = kind === 'containers' ? containers : context;
      const view = edited.find((each) => each.id === `${scope}.${kind}`);
      const after = view === undefined ? undefined : await drawnOf(view);
      if (after !== undefined) rows[kind].push({ edit: edit.kind, at: edit.at, ...rounded(change(before, after)) });
    }
  }
  for (const kind of ['containers', 'context']) {
    result[kind] = rows[kind].length === 0 ? undefined : { boxes: (kind === 'containers' ? containers : context).boxes.length, ...sharesOf(rows[kind]), edits: rows[kind] };
  }
  if (rows.containers.length === 0 && rows.context.length === 0) result.notes.push('it has too few boxes for an edit');

  // Nearest the middle is the first an edit was tried at; at the edge, the last.
  const tried = (kind) => edits.filter((edit) => edit.kind === kind && edit.views.includes('containers'));
  const middle = (kind) => tried(kind)[0];
  const edge = (kind) => tried(kind).at(-1);
  const chain = [edge('remove-app'), middle('add-app'), edge('add-connection'), middle('add-neighbour'), renameAtMiddle(model, containerView, containers)].filter((edit) => edit !== undefined);
  if (chain.length > 0) {
    let edited = model;
    for (const edit of chain) edited = edit.edit(edited);
    result.together = { edits: chain.length };
    for (const { view, drawn } of main) {
      const next = viewsOf(edited).find((each) => each.id === view.id);
      const after = next === undefined ? undefined : await drawnOf(next);
      if (after !== undefined) result.together[view.kind] = rounded(change(drawn, after));
    }
  }
  return finish();
}

/** The shares of a change to four places, which is all a table needs. */
function rounded(moved) {
  return Object.fromEntries(Object.entries(moved).map(([key, value]) => [key, key === 'common' ? value : Number(value.toFixed(4))]));
}

/** The means and the worst of a list of edits. */
function sharesOf(rows) {
  const mean = (key) => rows.reduce((sum, row) => sum + row[key], 0) / Math.max(rows.length, 1);
  return {
    count: rows.length,
    moved: mean('moved'),
    orderKept: mean('orderKept'),
    columnOrder: mean('columnOrder'),
    worst: { moved: Math.max(...rows.map((row) => row.moved)), orderKept: Math.min(...rows.map((row) => row.orderKept)), columnOrder: Math.min(...rows.map((row) => row.columnOrder)) },
  };
}

// The edits. Each takes a model and gives an edited copy; none changes the model it is given.

const clone = (model) => structuredClone(model);
const byId = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const FAMILIES = ['people', 'systems', 'apps', 'stores', 'infrastructure', 'components'];

/** The record of an element by its id, in any family that has a name. */
function recordOf(model, id) {
  for (const family of FAMILIES) {
    const found = model[family].find((record) => record.id === id);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** An id that no record of the model has: the one wanted, or it with a number after. */
function freeId(model, wanted) {
  const taken = new Set([...FAMILIES, 'connections'].flatMap((family) => model[family].map((record) => record.id)));
  for (let at = 1; ; at++) if (!taken.has(at === 1 ? wanted : `${wanted}-${at}`)) return at === 1 ? wanted : `${wanted}-${at}`;
}

/** `count` items spread evenly over a list, from its first to its last. */
function spread(items, count) {
  if (items.length <= count) return [...items];
  if (count === 1) return [items[0]];
  return Array.from({ length: count }, (_, at) => items[Math.round((at * (items.length - 1)) / (count - 1))]);
}

/** The ids given, from the box nearest the middle of a picture to the one farthest from it. */
function fromMiddle(drawn, ids) {
  const wanted = new Set(ids);
  const far = (box) => Math.hypot((box.x + box.width / 2 - drawn.width / 2) / drawn.width, (box.y + box.height / 2 - drawn.height / 2) / drawn.height);
  return drawn.boxes
    .filter((box) => wanted.has(box.id))
    .map((box) => ({ id: box.id, far: far(box) }))
    .sort((a, b) => a.far - b.far || (a.id < b.id ? -1 : 1))
    .map((each) => each.id);
}

/** How far apart two boxes of a picture stand. */
function distance(drawn, a, b) {
  const one = drawn.boxes.find((box) => box.id === a);
  const two = drawn.boxes.find((box) => box.id === b);
  if (one === undefined || two === undefined) return Number.POSITIVE_INFINITY;
  return Math.hypot(one.x - two.x, one.y - two.y);
}

/** A record's name said twice. */
function renamed(id) {
  return (model) => {
    const next = clone(model);
    const record = recordOf(next, id);
    if (record !== undefined) record.name = `${record.name} ${record.name}`;
    return next;
  };
}

/** Every rename and description to try on a view: each with its kind, and the edit. */
function renamesOf(model, view) {
  const tries = [];
  // Every box, the system itself, which a container view draws as its boundary, and every thing on a route.
  const named = new Set([...view.boxes.map((box) => box.id), view.scope, ...view.passed.map((each) => each.id)]);
  for (const id of [...named].sort()) if (recordOf(model, id) !== undefined) tries.push({ kind: 'name', edit: renamed(id) });
  // Connections, alone on an arrow and among several: the name said twice, and a few words longer.
  const connections = (alone) => view.arrows.filter((arrow) => (arrow.connections.length === 1) === alone).flatMap((arrow) => arrow.connections);
  for (const id of [...spread(connections(true), SOME), ...spread(connections(false), SOME)]) {
    for (const longer of [(name) => `${name} ${name}`, (name) => `${name} once more`]) {
      tries.push({
        kind: 'name',
        edit: (m) => {
          const next = clone(m);
          const record = next.connections.find((each) => each.id === id);
          if (record !== undefined) record.name = longer(record.name ?? 'A name given');
          return next;
        },
      });
    }
  }
  // Technologies that an arrow of the view names.
  const shown = new Set(view.arrows.flatMap((arrow) => arrow.technology));
  for (const id of spread(model.technologies.filter((each) => shown.has(each.name)).map((each) => each.id), SOME)) {
    tries.push({
      kind: 'name',
      edit: (m) => {
        const next = clone(m);
        const record = next.technologies.find((each) => each.id === id);
        if (record !== undefined) record.name = `${record.name} ${record.name}`;
        return next;
      },
    });
  }
  // A new description, for boxes spread over the view.
  for (const id of spread(view.boxes.map((box) => box.id).filter((id) => recordOf(model, id) !== undefined), SOME)) {
    tries.push({
      kind: 'description',
      edit: (m) => {
        const next = clone(m);
        const record = recordOf(next, id);
        if (record !== undefined) record.description = 'A new description, given for the trial of the layout. It has a second sentence.';
        return next;
      },
    });
  }
  return tries;
}

/** The box nearest the middle of the container view, renamed: the last of the five edits made together. */
function renameAtMiddle(model, view, drawn) {
  const [middle] = fromMiddle(drawn, view.boxes.filter((box) => box.inside).map((box) => box.id));
  return middle === undefined ? undefined : { kind: 'rename', at: 0, views: ['containers'], edit: renamed(middle) };
}

/**
 * The edits tried one at a time on the main system, each at boxes spread from the middle of
 * the picture to its edge: `at` is 0 for the box nearest the middle. Their targets are picked
 * on the pictures as they are, so the same model always gets the same edits.
 */
function editsFor(model, scope, context, containers) {
  const edits = [];
  const { view, drawn } = containers;
  const arrowsAt = (of, id) => of.arrows.filter((arrow) => arrow.from === id || arrow.to === id).length;
  const joined = (of, a, b) => of.arrows.some((arrow) => (arrow.from === a && arrow.to === b) || (arrow.from === b && arrow.to === a));
  const isStore = (id) => model.stores.some((store) => store.id === id);
  const isPerson = (id) => model.people.some((person) => person.id === id);
  const insideOrdered = fromMiddle(drawn, view.boxes.filter((box) => box.inside).map((box) => box.id));
  const outsideOrdered = fromMiddle(drawn, view.boxes.filter((box) => !box.inside).map((box) => box.id));
  const apps = fromMiddle(drawn, view.boxes.filter((box) => box.inside && box.family === 'apps' && arrowsAt(view, box.id) > 0).map((box) => box.id));
  const anchors = spread(insideOrdered, TARGETS);

  // An app with two connections: between the box and the box nearest it, or, at the edge, to the box outside that stands farthest from the middle.
  for (const [at, a] of anchors.entries()) {
    const near = insideOrdered.filter((id) => id !== a).sort((x, y) => distance(drawn, a, x) - distance(drawn, a, y))[0];
    const b = at === anchors.length - 1 && anchors.length > 1 ? (outsideOrdered.at(-1) ?? near) : near;
    if (b === undefined) continue;
    edits.push({
      kind: 'add-app',
      at,
      views: ['context', 'containers'],
      edit: (m) => {
        const next = clone(m);
        const id = freeId(next, 'new-thing');
        next.apps.push({ id, file: `apps/${id}.yaml`, name: 'New thing', in: scope, kind: 'service', description: 'A new app, added for the trial of the layout.' });
        const first = isStore(a) ? { from: id, to: a } : { from: a, to: id };
        const second = isPerson(b) ? { from: b, to: id } : { from: id, to: b };
        next.connections.push({ id: `${id}-asks`, file: `connections/${id}-asks.yaml`, name: 'Asks the new thing', ...first });
        next.connections.push({ id: `${id}-tells`, file: `connections/${id}-tells.yaml`, name: 'Tells of a result', ...second });
        next.apps.sort(byId);
        next.connections.sort(byId);
        return next;
      },
    });
  }

  // A new system outside, with one connection from a box inside: a box more in both views.
  for (const [at, a] of anchors.entries()) {
    if (isStore(a)) continue;
    edits.push({
      kind: 'add-neighbour',
      at,
      views: ['context', 'containers'],
      edit: (m) => {
        const next = clone(m);
        const id = freeId(next, 'new-system');
        next.systems.push({ id, file: `systems/${id}.yaml`, name: 'New system', external: true, description: 'A new system outside, added for the trial of the layout.' });
        next.connections.push({ id: `${id}-asked`, file: `connections/${id}-asked.yaml`, name: 'Asks the new system', from: a, to: id });
        next.systems.sort(byId);
        next.connections.sort(byId);
        return next;
      },
    });
  }

  // An app that has connections taken out, with what is in it and what it keeps; and one moved to another system.
  const systemsInView = view.boxes.filter((box) => !box.inside && box.family === 'systems').map((box) => box.id);
  const ours = systemsInView.filter((id) => model.systems.find((system) => system.id === id)?.external !== true);
  const destination = ours[0] ?? systemsInView[0] ?? model.systems.find((system) => system.id !== scope)?.id;
  for (const [at, app] of spread(apps, TARGETS).entries()) {
    edits.push({ kind: 'remove-app', at, views: ['context', 'containers'], edit: (m) => withoutApp(m, app) });
    if (destination === undefined) continue;
    edits.push({
      kind: 'move-app',
      at,
      views: ['context', 'containers'],
      edit: (m) => {
        const next = clone(m);
        const record = next.apps.find((each) => each.id === app);
        if (record !== undefined) record.in = destination;
        return next;
      },
    });
  }

  // A connection between two boxes inside that had none: to the nearest such box, or, at the edge, to the farthest.
  for (const [at, a] of anchors.entries()) {
    const free = insideOrdered.filter((id) => id !== a && !joined(view, a, id) && !(isStore(a) && isStore(id)));
    free.sort((x, y) => distance(drawn, a, x) - distance(drawn, a, y));
    const b = at === anchors.length - 1 && anchors.length > 1 ? free.at(-1) : free[0];
    if (b === undefined) continue;
    const [from, to] = isStore(a) ? [b, a] : [a, b];
    edits.push({ kind: 'add-connection', at, views: ['containers'], edit: (m) => withConnection(m, from, to) });
  }
  // In the context view: the other way between the system and a neighbour that has an arrow one way only.
  const oneWay = fromMiddle(
    context.drawn,
    context.view.boxes.filter((box) => !box.scope && box.family !== 'people' && arrowsAt(context.view, box.id) === 1).map((box) => box.id),
  );
  for (const [at, id] of spread(oneWay, TARGETS).entries()) {
    const outward = context.view.arrows.some((arrow) => arrow.from === scope && arrow.to === id);
    const [from, to] = outward ? [id, scope] : [scope, id];
    edits.push({ kind: 'add-connection', at, views: ['context'], edit: (m) => withConnection(m, from, to) });
  }
  return edits;
}

/** A model with one connection more. */
function withConnection(model, from, to) {
  const next = clone(model);
  const id = freeId(next, 'new-connection');
  next.connections.push({ id, file: `connections/${id}.yaml`, name: 'Asks for a new thing', from, to });
  next.connections.sort(byId);
  return next;
}

/** A model without an app, what is in it, what it keeps, and every connection at any of them. */
function withoutApp(model, app) {
  const next = clone(model);
  const gone = new Set([app]);
  for (const component of next.components) if (component.in === app) gone.add(component.id);
  for (const store of next.stores) if (store.in === app) gone.add(store.id);
  next.apps = next.apps.filter((each) => !gone.has(each.id));
  next.components = next.components.filter((each) => !gone.has(each.id));
  next.stores = next.stores.filter((each) => !gone.has(each.id));
  next.connections = next.connections.filter((each) => !gone.has(each.from) && !gone.has(each.to));
  for (const connection of next.connections) {
    if (connection.via === undefined) continue;
    const via = connection.via.filter((hop) => !gone.has(hop));
    if (via.length === 0) delete connection.via;
    else connection.via = via;
  }
  return next;
}

// The summary, the pass numbers and the table.

/** The numbers of every directory together: edits are pooled, so that each counts once. */
function summaryOf(results) {
  const sum = (pick) => results.reduce((total, each) => total + (pick(each) ?? 0), 0);
  const pooled = (kind) => {
    const rows = results.flatMap((each) => each[kind]?.edits ?? []);
    return rows.length === 0 ? undefined : { ...sharesOf(rows), edits: undefined };
  };
  const together = (kind) => {
    const done = results.map((each) => each.together?.[kind]).filter((each) => each !== undefined);
    if (done.length === 0) return undefined;
    const mean = (key) => done.reduce((total, each) => total + each[key], 0) / done.length;
    return { moved: mean('moved'), orderKept: mean('orderKept'), columnOrder: mean('columnOrder') };
  };
  const mains = results.filter((each) => each.main !== undefined);
  return {
    views: sum((each) => each.views),
    differAgain: sum((each) => each.differAgain),
    differInOrder: sum((each) => each.differInOrder),
    failed: sum((each) => each.failed),
    slowestMs: Math.max(0, ...results.map((each) => each.slowestMs)),
    crowded: { views: sum((each) => each.crowded.views), reported: sum((each) => each.crowded.reported) },
    renames: { tried: sum((each) => each.renames.tried), moved: sum((each) => each.renames.moved) },
    descriptions: { tried: sum((each) => each.descriptions.tried), moved: sum((each) => each.descriptions.moved) },
    containers: pooled('containers'),
    context: pooled('context'),
    together: { containers: together('containers'), context: together('context') },
    main: mains.length === 0 ? undefined : { crossings: sum((each) => each.main?.crossings), area: sum((each) => each.main?.area), slowestMs: Math.max(...mains.map((each) => each.main.slowestMs)) },
  };
}

/** Each pass number of the spec, what was measured, and whether it passes. */
function passesOf(results, all) {
  // One decimal, so that a share just under its pass number does not read as equal to it.
  const pc = (share) => `${(Math.floor(share * 1000) / 10).toFixed(1)} %`;
  const list = [];
  const add = (number, what, measured, passes) => list.push({ number, what, measured, passes });
  add(1, 'The same model, laid out again and in another order: no view differs', `${all.differAgain} differ again, ${all.differInOrder} in another order, ${all.failed} not drawn, of ${all.views}`, all.differAgain === 0 && all.differInOrder === 0 && all.failed === 0);
  const tried = all.renames.tried + all.descriptions.tried;
  const moved = all.renames.moved + all.descriptions.moved;
  add(2, 'A new name or a new description: nothing moves in any try', `${moved} of ${tried} tries move something`, moved === 0);
  const c = all.containers;
  if (c === undefined) {
    add(3, 'One edit, container view: pairs in one column that keep their order', 'no container view to edit', true);
    add(4, 'One edit, container view: pairs that keep their order both ways', 'no container view to edit', true);
  } else {
    add(3, 'One edit, container view: pairs in one column that keep their order: 95 % over all models, 75 % in the worst edit', `${pc(c.columnOrder)}, worst ${pc(c.worst.columnOrder)}`, c.columnOrder >= PASS.column && c.worst.columnOrder >= PASS.columnWorst);
    const each = results.filter((result) => result.containers !== undefined);
    const least = Math.min(...each.map((result) => result.containers.orderKept));
    add(4, 'One edit, container view: pairs that keep their order both ways: 80 % over all models, 65 % in each model', `${pc(c.orderKept)}, least in a model ${pc(least)}`, c.orderKept >= PASS.pairs && least >= PASS.pairsEachModel);
  }
  const k = all.context;
  add(5, 'One edit, context view: pairs that keep their order both ways: 80 % over all models', k === undefined ? 'no context view to edit' : pc(k.orderKept), k === undefined || k.orderKept >= PASS.context);
  add(6, 'The slowest layout: 2 seconds', `${(all.slowestMs / 1000).toFixed(2)} s`, all.slowestMs <= PASS.slowest);
  add(7, `A view of more than ${CROWDED_FROM} boxes: each is reported by the check`, `${all.crowded.reported} reported of ${all.crowded.views}`, results.every((each) => each.crowded.reported >= each.crowded.views));
  return list;
}

/** The table, for a person. */
function print(results, all, passes) {
  const pc = (share) => (share === undefined ? '-' : String(Math.round(share * 100)));
  const rows = [...results.map((each) => ({ ...each, name: each.label })), { ...all, name: 'All', notes: [] }];
  const lines = [];
  lines.push(`The layout tried on ${results.length} source ${results.length === 1 ? 'directory' : 'directories'}. Shares are in per cent. A box has moved when its centre is more than half a box (${BOX_WIDTH / 2} by ${BOX_HEIGHT / 2} px) from where it stood, after the shift all boxes share.`, '');

  lines.push('The same picture, and new names', ...table(['', 'Views', 'Differ again', 'In another order', 'Not drawn', 'Renames', 'Moved', 'Descriptions', 'Moved'], rows.map((row) => [row.name, row.views, row.differAgain, row.differInOrder, row.failed, row.renames.tried, row.renames.moved, row.descriptions.tried, row.descriptions.moved])), '');

  for (const [kind, title] of [
    ['containers', 'One edit, container view of the system with the largest'],
    ['context', 'One edit, context view of the same system'],
  ]) {
    const header = ['', 'Boxes', 'Edits', 'Moved', 'Order kept', 'In a column', 'Worst moved', 'Worst kept', 'Worst in a column'];
    lines.push(title, ...table(header, rows.map((row) => {
      const shares = row[kind];
      if (shares === undefined) return [row.name, '-', 0, '-', '-', '-', '-', '-', '-'];
      return [row.name, shares.boxes ?? '', shares.count, pc(shares.moved), pc(shares.orderKept), pc(shares.columnOrder), pc(shares.worst.moved), pc(shares.worst.orderKept), pc(shares.worst.columnOrder)];
    })), '');
  }

  lines.push('Five edits made together: moved, order kept, in a column', ...table(['', 'Container view', 'Context view'], rows.map((row) => {
    const cell = (shares) => (shares === undefined ? '-' : `${pc(shares.moved)}, ${pc(shares.orderKept)}, ${pc(shares.columnOrder)}`);
    return [row.name, cell(row.together?.containers), cell(row.together?.context)];
  })), '');

  lines.push('The two main views as they are, and the slowest of every layout made', ...table(['', 'Crossings', 'Area, million px²', 'Slowest, s', 'Slowest of all, s', `Views over ${CROWDED_FROM} boxes`, 'Reported'], rows.map((row) => [
    row.name,
    row.main?.crossings ?? '-',
    row.main === undefined ? '-' : (row.main.area / 1e6).toFixed(1),
    row.main === undefined ? '-' : (row.main.slowestMs / 1000).toFixed(2),
    (row.slowestMs / 1000).toFixed(2),
    row.crowded.views,
    row.crowded.reported,
  ])), '');

  const notes = results.flatMap((each) => each.notes.map((note) => `${each.label}: ${note}.`));
  if (notes.length > 0) lines.push(...notes, '');
  for (const each of passes) lines.push(`${each.number}  ${each.passes ? 'passes' : 'fails '}  ${each.what}. Measured: ${each.measured}.`);
  console.log(lines.join('\n'));
}

/** Rows of cells as lines, each column as wide as its widest cell: the first to the left, the others to the right. */
function table(header, rows) {
  const cells = [header, ...rows].map((row) => row.map(String));
  const widths = header.map((_, at) => Math.max(...cells.map((row) => (row[at] ?? '').length)));
  return cells.map((row) => row.map((cell, at) => (at === 0 ? cell.padEnd(widths[at]) : cell.padStart(widths[at]))).join('  ').trimEnd());
}

await main();
