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
// Each directory must be sound. One that cannot be read, or in which `seefore check` finds an
// error, ends the run before anything is laid out. An empty folder is such a one: it has no
// marker.
//
// What it tries. For each directory it lays out every view twice, and once more with the files
// read in the opposite order, the boxes and arrows handed over shuffled, in another thread.
// Then it edits copies of the model in memory and compares the pictures of the two main views:
// the container view of the system whose container view has the most boxes, the first by id of
// those with as many, and that system's context view.
//
// - A new name, for every box, the system itself and every thing on a route, for some
//   connections alone on an arrow and some among several, and for some technologies: once a
//   short name, and once one of `NAME_MAX` characters, the longest a name may be. A new
//   description, for some boxes. Nothing may move, the middle of every label among it.
// - One edit at a time: an app added, taken out or moved to another system; a store added or
//   taken out; a connection added or taken out, between two boxes inside and between the system
//   and a neighbour; and a new system outside.
// - Five edits made together.
// - For each edit of one record, every other view of the model that it changes.
//
// How the targets are picked: from the model alone, never from a picture, so that a directory
// gets the same edits under any layout. The boxes, or the arrows, of the view that an edit can
// take are put in order of id, and four of them are taken, spread evenly over that order from
// its first to its last. Where an edit needs a second box, it is the next in that order after
// the first that the edit can take, or, for the last of the four, the last box outside. Five
// edits made together are worked out one after the other, each on the model the one before
// left, so that none names a record an earlier one took out.
//
// Every edited model is checked as `seefore check` checks a directory, before it is laid out.
// One that is not sound is a fault of this script, and the run stops.
//
// How a share is made. For each edit, the share of its pairs of boxes that keep their order:
// both ways, over the pairs of boxes that stand in both pictures; in a column, over the pairs
// that stand in one column in both. Two boxes at the same height stand neither way round, and
// a pair keeps its order when both pictures have it so. A share over many edits is the mean of
// each edit's own share, each edit counting once whatever its number of pairs. An edit with no
// pair is in no share; nor is one that does not reach the view, whose view goes to the layout
// as it was: those are counted apart. Shares are compared with the pass numbers as measured,
// and rounded down only to be printed.
//
// Pass number 3 has its floor for the worst edit among the edits that add something. An edit
// that takes something out or moves an app may take away a box that the walk passes early, and
// no order taken from the arrows holds through that: the worst of those is printed beside the
// other, with no floor.
//
// It prints a table for each measure, with a row for each directory and one for all, and then
// each pass number of `docs/layout.md` with "passes", "fails" or "not tried": a pass number with
// nothing to measure is not tried. With `--json` it prints the same as data. It prints counts
// and shares only, never a name or an id from a model, so that its tables can be shown for a
// model that is not public.
//
// Exit code: 0 when every pass number passes; 1 when one fails or is not tried; 2 when a
// directory cannot be tried; 3 when the script made an edited model that is not sound.
import { basename, resolve, sep } from 'node:path';
import { parseArgs } from 'node:util';
import { CROWDED_FROM, MARKER_FILE, NAME_MAX, load, viewsOf } from '../packages/core/src/index.ts';
import { isDirectory, readSourceFiles } from '../packages/cli/src/directory.ts';
import { graphOf, sorted } from '../packages/layout/src/graph.ts';
import { LAYOUT_LIMIT, startRunner } from '../packages/layout/src/node.ts';
import { BOX_HEIGHT, BOX_WIDTH } from '../packages/layout/src/sizes.ts';
import { boxText, labelText } from '../packages/layout/src/text.ts';
import { againstWalk, change, columnPairs, crossings, placesOf } from '../packages/layout/test/change.ts';
import { troubles } from '../packages/layout/test/geometry.ts';

/** How many targets each edit is tried at, spread over the order of id. */
const TARGETS = 4;
/** How many connections, technologies and descriptions of each kind are renamed on a view. */
const SOME = 12;
/** The pass numbers of `docs/layout.md`, "What must be true". */
const PASS = { column: 0.95, columnWorst: 0.75, pairs: 0.8, pairsEachModel: 0.65, context: 0.8, slowest: 2000 };
/**
 * The boxes a view may have before it is crowded: `docs/layout.md` says "more than 40". The
 * script holds its own number, so that a change to the check's `CROWDED_FROM` shows here as a
 * miss and not as a new limit.
 */
const CROWDED = 40;
/** The exit codes. */
const EXIT = { passes: 0, misses: 1, cannot: 2, fault: 3 };

/** A short name, and one as long as a name may be: words, with no space at either end. */
const SHORT_NAME = 'Ab';
const LONG_NAME = longName(NAME_MAX);

/** A name of exactly `length` characters, of words, that the format allows. */
function longName(length) {
  const words = 'A name as long as a name may be, made of words that go on '.repeat(Math.ceil(length / 40));
  const cut = words.slice(0, length).trimEnd();
  return cut + 'x'.repeat(length - cut.length);
}

/** What the script did wrong. It ends the run with its own exit code, and says so. */
class Fault extends Error {}

/** Tries every directory, prints what it found, and sets the exit code of the pass numbers. */
async function main() {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean', default: false } } });
  } catch (error) {
    console.error(`${error.message}\nusage: node scripts/steady.mjs <directory> [<directory> ...] [--json]`);
    process.exitCode = EXIT.cannot;
    return;
  }
  const { values, positionals } = parsed;
  if (positionals.length === 0) {
    console.error('usage: node scripts/steady.mjs <directory> [<directory> ...] [--json]');
    process.exitCode = EXIT.cannot;
    return;
  }
  const directories = positionals.map((each) => resolve(each));
  const labels = labelsOf(directories);
  const sources = [];
  for (const [at, directory] of directories.entries()) {
    const source = sourceOf(directory, labels[at], positionals[at]);
    if (typeof source === 'string') {
      console.error(source);
      process.exitCode = EXIT.cannot;
      return;
    }
    sources.push(source);
  }

  const worker = new URL('../packages/layout/src/worker.ts', import.meta.url);
  const runners = { first: startRunner({ worker, limit: LAYOUT_LIMIT }), other: startRunner({ worker, limit: LAYOUT_LIMIT }) };
  const results = [];
  try {
    // A thread starts and loads ELK with its first layout: that time is not the layout's.
    const warm = { id: 'warm.context', kind: 'context', scope: 'warm', title: '', boxes: [], arrows: [], left: { outside: [], broken: [] }, legend: [], passed: [] };
    await runners.first.layOut(warm);
    await runners.other.layOut(warm);
    for (const source of sources) {
      process.stderr.write(`${source.label}: laying out\n`);
      results.push(await tryDirectory(source, runners));
    }
  } catch (error) {
    if (!(error instanceof Fault)) throw error;
    console.error(error.message);
    process.exitCode = EXIT.fault;
    return;
  } finally {
    await runners.first.close();
    await runners.other.close();
  }
  const all = summaryOf(results);
  const passes = passesOf(results, all);
  const limit = CROWDED === CROWDED_FROM ? undefined : `The check counts a view as crowded from more than ${CROWDED_FROM} boxes, and the spec from more than ${CROWDED}: the script counts with the spec's.`;
  // Written, and the exit code set, without ending the process: a pipe takes its time to drain.
  const text = values.json ? JSON.stringify({ directories: results, all, passes, ...(limit === undefined ? {} : { limit }) }, null, 1) : printed(results, all, passes, limit);
  process.stdout.write(`${text}\n`);
  process.exitCode = passes.every((each) => each.status === 'passes') ? EXIT.passes : EXIT.misses;
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

/**
 * A directory read and checked, or the sentence that says why it cannot be tried. The sentence
 * names the directory as it was given, and nothing from inside it.
 */
function sourceOf(directory, label, given) {
  if (!isDirectory(directory)) return `${given} is not a folder. Give the source directory of a model.`;
  const read = readSourceFiles(directory);
  const loaded = load(read.files);
  const errors = [...read.problems, ...loaded.problems].filter((problem) => problem.severity === 'error');
  if (errors.some((problem) => problem.code === 'marker-missing')) return `${given} has no ${MARKER_FILE}, so it is not a source directory and there is no model to try. Give the source directory of a model.`;
  if (errors.length > 0) {
    const unread = errors.filter((problem) => problem.code.endsWith('-unreadable') || problem.code === 'not-utf8').length;
    const why = unread > 0 ? `${unread} of its files or folders cannot be read` : `seefore check finds ${errors.length === 1 ? 'an error' : `${errors.length} errors`} in it`;
    return `${given} cannot be tried: ${why}. Run seefore check there, and try it once the check finds no error.`;
  }
  const marker = read.files.find((file) => file.path === MARKER_FILE);
  return { directory, label, read, loaded, marker };
}

/** The files of a model as `seefore check` reads them: its marker, and each record as JSON, which is YAML. */
function filesOf(model, marker) {
  const files = [marker];
  for (const family of Object.keys(model)) for (const { id: _, file, ...rest } of model[family]) files.push({ path: file, text: JSON.stringify(rest) });
  return files;
}

/** Stops the run when an edited model is not sound, saying which edit made it and the codes of what is wrong. */
function soundOrStop(model, source, what) {
  const errors = load(filesOf(model, source.marker)).problems.filter((problem) => problem.severity === 'error');
  if (errors.length === 0) return;
  const codes = [...new Set(errors.map((problem) => problem.code))].join(', ');
  throw new Fault(`${source.label}: ${what} gives a model that is not sound, with ${errors.length === 1 ? 'an error' : `${errors.length} errors`} (${codes}). That is a fault of this script, not of the layout: mend the edit and run it again.`);
}

/**
 * What the layout makes of a view before ELK lays it out, as `layOut` makes it: the graph ELK
 * is given, and the words it then puts in each box, label and title. The same text means the
 * same picture. What the page alone reads of a view, as the connections held inside a box, is
 * not in it: an edit that changes only that does not reach the layout.
 */
function inputOf(view) {
  const input = sorted(view);
  const labels = new Map();
  for (const arrow of input.arrows) {
    const label = labelText(arrow);
    if (label !== undefined) labels.set(arrow.id, label);
  }
  const boundary = input.boundary === undefined ? null : [input.boundary.name, input.boundary.line, input.boundary.title, input.boundary.only];
  return JSON.stringify({ graph: graphOf(input, labels), boxes: input.boxes.map(boxText), boundary, labels: [...labels] });
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

/** The counts that every layout of a directory adds to: time, what was not drawn, the walk and the geometry. */
function newTally() {
  return {
    layouts: 0,
    slowestMs: 0,
    failed: 0,
    walk: { pairs: 0, against: 0, views: 0 },
    geometry: { pictures: 0, withTroubles: 0, troubles: 0 },
  };
}

/** The pictures whose geometry has been checked, so that each is counted once. */
const checked = new WeakSet();

/** Checks the geometry of a picture that is compared, once, and counts what is wrong with it. */
function checkGeometry(tally, drawn) {
  if (checked.has(drawn)) return;
  checked.add(drawn);
  const found = troubles(drawn).length;
  tally.geometry.pictures += 1;
  if (found > 0) tally.geometry.withTroubles += 1;
  tally.geometry.troubles += found;
}

/**
 * The picture of a view, or undefined when it was not drawn. It counts the time, which is the
 * layout's own since one layout is asked for at a time, and the pairs of one column that stand
 * against the walk.
 */
async function layOutOn(tally, view, by) {
  const started = performance.now();
  const picture = await by.layOut(view);
  const ms = performance.now() - started;
  tally.layouts += 1;
  tally.slowestMs = Math.max(tally.slowestMs, ms);
  if ('failed' in picture) {
    tally.failed += 1;
    return { drawn: undefined, ms };
  }
  const against = againstWalk(view, picture).length;
  tally.walk.pairs += columnPairs(view, picture).length;
  tally.walk.against += against;
  if (against > 0) tally.walk.views += 1;
  return { drawn: picture, ms };
}

/** The tries of one measure on one view: how many there were, how many were set apart and why, and the change of each that was measured. */
function newTries() {
  return { tried: 0, notReached: 0, gone: 0, notDrawn: 0, rows: [] };
}

/** Everything the script measures on one source directory. */
async function tryDirectory(source, runners) {
  const { label, loaded, read } = source;
  const model = loaded.model;
  const views = viewsOf(model);
  const byId = new Map(views.map((view) => [view.id, view]));
  const reversed = new Map(viewsOf(load([...read.files].reverse()).model).map((view) => [view.id, view]));
  const tally = newTally();
  const result = {
    label,
    views: views.length,
    differAgain: 0,
    differInOrder: 0,
    crowded: crowdedOf(model, loaded.problems, views),
    renames: { tried: 0, notReached: 0, moved: 0 },
    descriptions: { tried: 0, notReached: 0, moved: 0 },
    main: undefined,
    containers: undefined,
    context: undefined,
    together: undefined,
    others: undefined,
    tally,
    notes: [],
  };
  if (views.length === 0) result.notes.push('it has no view');
  soundOrStop(model, source, 'the model as read, written back');

  // The same model, laid out again, and in another order in another thread.
  const first = new Map();
  const firstMs = new Map();
  for (const view of views) {
    const once = await layOutOn(tally, view, runners.first);
    const again = await layOutOn(tally, view, runners.first);
    const turned = reversed.get(view.id);
    const mixed = turned === undefined ? undefined : await layOutOn(tally, { ...turned, boxes: shuffled(turned.boxes, 7), arrows: shuffled(turned.arrows, 11) }, runners.other);
    if (once.drawn === undefined) continue;
    first.set(view.id, once.drawn);
    firstMs.set(view.id, once.ms);
    if (JSON.stringify(again.drawn) !== JSON.stringify(once.drawn)) result.differAgain += 1;
    if (JSON.stringify(mixed?.drawn) !== JSON.stringify(once.drawn)) result.differInOrder += 1;
  }

  const containerView = views.filter((view) => view.kind === 'containers').sort((a, b) => b.boxes.length - a.boxes.length || byText(a.id, b.id))[0];
  if (containerView === undefined) {
    result.notes.push('it has no container view, so no edit is tried');
    return result;
  }
  const scope = containerView.scope;
  const contextView = byId.get(`${scope}.context`);
  const containers = first.get(containerView.id);
  const context = contextView === undefined ? undefined : first.get(contextView.id);
  if (containers === undefined || context === undefined) {
    result.notes.push('its main views were not drawn, so no edit is tried');
    return result;
  }
  const main = { containers: { view: containerView, drawn: containers }, context: { view: contextView, drawn: context } };
  for (const each of Object.values(main)) checkGeometry(tally, each.drawn);
  result.main = {
    boxes: { containers: containerView.boxes.length, context: contextView.boxes.length },
    crossings: crossings(containers) + crossings(context),
    area: containers.width * containers.height + context.width * context.height,
    slowestMs: Math.max(firstMs.get(containerView.id) ?? 0, firstMs.get(contextView.id) ?? 0),
  };

  // A new name or a new description: nothing may move, and every label keeps its middle.
  for (const { view, drawn } of Object.values(main)) {
    const was = placesOf(drawn);
    const input = inputOf(view);
    for (const rename of renamesOf(model, view)) {
      const edited = rename.edit(model);
      soundOrStop(edited, source, `a new ${rename.kind}`);
      const into = rename.kind === 'description' ? result.descriptions : result.renames;
      into.tried += 1;
      const after = viewsOf(edited).find((each) => each.id === view.id);
      if (after === undefined || inputOf(after) === input) {
        into.notReached += 1;
        continue;
      }
      const picture = (await layOutOn(tally, after, runners.first)).drawn;
      if (picture !== undefined) checkGeometry(tally, picture);
      if (picture === undefined || placesOf(picture) !== was) into.moved += 1;
    }
  }

  // One edit at a time, on both main views, and on every other view it changes.
  result.containers = newTries();
  result.context = newTries();
  const others = { edits: 0, gone: 0, added: 0, notDrawn: 0, rows: [] };
  const inputs = new Map(views.map((view) => [view.id, inputOf(view)]));
  for (const edit of singleEdits(model, scope)) {
    soundOrStop(edit.model, source, `${edit.kind} at target ${edit.at + 1}`);
    const edited = new Map(viewsOf(edit.model).map((view) => [view.id, view]));
    for (const kind of ['containers', 'context']) {
      const row = await triedOn(tally, runners, result[kind], main[kind], edited.get(main[kind].view.id));
      if (row !== undefined) result[kind].rows.push({ edit: edit.kind, at: edit.at, ...row });
    }
    let reached = false;
    for (const [id, view] of edited) {
      if (id === containerView.id || id === contextView.id) continue;
      const before = first.get(id);
      if (!inputs.has(id)) others.added += 1;
      if (before === undefined || inputs.get(id) === inputOf(view)) continue;
      reached = true;
      const after = (await layOutOn(tally, view, runners.first)).drawn;
      if (after === undefined) {
        others.notDrawn += 1;
        continue;
      }
      checkGeometry(tally, before);
      checkGeometry(tally, after);
      others.rows.push({ edit: edit.kind, at: edit.at, ...change(before, after) });
    }
    for (const id of inputs.keys()) if (!edited.has(id)) others.gone += 1;
    if (reached) others.edits += 1;
  }
  result.others = others;
  if (result.containers.rows.length === 0 && result.context.rows.length === 0) result.notes.push('no edit could be measured on its main views');

  // Five edits together, each worked out on the model the one before left.
  let edited = model;
  const kinds = [];
  for (const [kind, at] of TOGETHER) {
    const edit = EDITS[kind](edited, scope, at);
    if (edit === undefined) continue;
    soundOrStop(edit.model, source, `${kind} at target ${at + 1} of the edits made together, after ${kinds.length}`);
    edited = edit.model;
    kinds.push(kind);
  }
  if (kinds.length > 0) {
    const last = new Map(viewsOf(edited).map((view) => [view.id, view]));
    result.together = { edits: kinds.length, kinds };
    for (const kind of ['containers', 'context']) {
      const tries = newTries();
      const row = await triedOn(tally, runners, tries, main[kind], last.get(main[kind].view.id));
      result.together[kind] = row ?? (tries.gone > 0 ? 'gone' : tries.notReached > 0 ? 'not reached' : 'not drawn');
    }
  }
  return result;
}

/**
 * One edit tried on one main view: the change it made, or undefined when the view is gone, is
 * handed over as it was, or was not drawn, each of which is counted on the tries.
 */
async function triedOn(tally, runners, tries, before, view) {
  tries.tried += 1;
  if (view === undefined) {
    tries.gone += 1;
    return undefined;
  }
  if (inputOf(view) === inputOf(before.view)) {
    tries.notReached += 1;
    return undefined;
  }
  const after = (await layOutOn(tally, view, runners.first)).drawn;
  if (after === undefined) {
    tries.notDrawn += 1;
    return undefined;
  }
  checkGeometry(tally, after);
  return change(before.drawn, after);
}

/**
 * The views over `CROWDED` boxes, and the warnings `seefore check` gives for them, as one line
 * each: the file of the view's system, the kind of view, its boxes and the severity. Every view
 * over the limit must have its warning, and no other view one.
 */
function crowdedOf(model, problems, views) {
  const files = new Map(model.systems.map((system) => [system.id, system.file]));
  const expected = views.filter((view) => view.boxes.length > CROWDED).map((view) => `${files.get(view.scope) ?? '?'} ${view.kind === 'context' ? 'context' : 'container'} ${view.boxes.length} warning`).sort();
  const reported = problems
    .filter((problem) => problem.code === 'view-crowded')
    .map((problem) => `${problem.file} ${/\bcontext view\b/.test(problem.message) ? 'context' : /\bcontainer view\b/.test(problem.message) ? 'container' : '?'} ${/ has (\d+) boxes/.exec(problem.message)?.[1] ?? '?'} ${problem.severity}`)
    .sort();
  const left = [...reported];
  let matched = 0;
  for (const each of expected) {
    const at = left.indexOf(each);
    if (at < 0) continue;
    left.splice(at, 1);
    matched += 1;
  }
  // The lines name files, which are ids: only their counts leave the script.
  return { expected: expected.length, reported: reported.length, matched, missing: expected.length - matched, extra: left.length };
}

// The edits. Each takes a model, the system in scope and which of the four targets, and gives
// an edited copy with the target it took, or undefined when the view has none for it. None
// changes the model it is given, and each picks its target from that model alone.

const clone = (model) => structuredClone(model);
const FAMILIES = ['people', 'systems', 'apps', 'stores', 'components', 'infrastructure'];

/** Order of two ids, character by character. */
function byText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** The views of a model, worked out once for each model. */
const viewsCache = new WeakMap();
function viewsFor(model) {
  if (!viewsCache.has(model)) viewsCache.set(model, viewsOf(model));
  return viewsCache.get(model);
}

/** The view of a kind of the system in scope, in a model. */
function viewOf(model, scope, kind) {
  return viewsFor(model).find((view) => view.id === `${scope}.${kind}`);
}

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

/** Each edit by its kind. */
const EDITS = {
  /** A new app inside, which a box inside acts on, or which keeps a store, and which acts on the next box, or on the last box outside. */
  'add-app': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    if (view === undefined) return undefined;
    const inside = idsOf(view.boxes.filter((box) => box.inside));
    const outside = idsOf(view.boxes.filter((box) => !box.inside));
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
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && isApp(model, box.id))), at);
    if (app === undefined) return undefined;
    const held = [...model.components, ...model.stores].filter((record) => record.in === app).map((record) => record.id);
    return { target: app, model: tidy(withoutRecords(model, [app, ...held])) };
  },
  /** An app inside moved to another system: the first by id of those the view draws that are ours, else of those it draws, else of any. */
  'move-app': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && isApp(model, box.id))), at);
    if (app === undefined) return undefined;
    const drawn = idsOf(view.boxes.filter((box) => !box.inside && box.family === 'systems'));
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
    const app = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && isApp(model, box.id))), at);
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
    const store = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && isStore(model, box.id))), at);
    if (store === undefined) return undefined;
    return { target: store, model: tidy(withoutRecords(model, [store])) };
  },
  /** A connection between a box inside and the next box inside that has no arrow to it, from the one that is not a store. */
  'add-connection': (model, scope, at) => {
    const view = viewOf(model, scope, 'containers');
    if (view === undefined) return undefined;
    const inside = idsOf(view.boxes.filter((box) => box.inside));
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
    const a = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && !isStore(model, box.id))), at);
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
    const id = view === undefined ? undefined : pick(idsOf(view.boxes.filter((box) => box.inside && recordOf(model, box.id) !== undefined)), at);
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
 * The edits that add something. The floor of pass number 3 for the worst edit is for these. An
 * edit that takes something out, or moves an app, may take away a box that the walk passes
 * early: the walk then reaches the rest another way, and no order taken from the arrows holds
 * through that. The worst of those is printed beside, and has no floor.
 */
const ADDS = new Set(['add-app', 'add-store', 'add-connection', 'add-neighbour', 'add-connection-outside']);

/** The five edits made together, each with the target it takes. */
const TOGETHER = [
  ['remove-app', TARGETS - 1],
  ['add-app', 0],
  ['add-connection', TARGETS - 1],
  ['add-neighbour', 0],
  ['rename', 1],
];

/** Every edit tried one at a time on the model: each kind at each of its targets, a target once. */
function singleEdits(model, scope) {
  const edits = [];
  for (const kind of SINGLE) {
    const targets = new Set();
    for (let at = 0; at < TARGETS; at++) {
      const edit = EDITS[kind](model, scope, at);
      if (edit === undefined || targets.has(edit.target)) continue;
      targets.add(edit.target);
      edits.push({ kind, at, model: edit.model });
    }
  }
  return edits;
}

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
function renamesOf(model, view) {
  const named = new Set([...view.boxes.map((box) => box.id), view.scope, ...view.passed.map((each) => each.id)]);
  const targets = [...named].filter((id) => recordOf(model, id) !== undefined).sort(byText);
  // Connections, alone on an arrow and among several.
  const connections = (alone) => view.arrows.filter((arrow) => (arrow.connections.length === 1) === alone).flatMap((arrow) => arrow.connections).filter((id) => model.connections.some((each) => each.id === id)).sort(byText);
  targets.push(...spread(connections(true), SOME), ...spread(connections(false), SOME));
  // Technologies that an arrow of the view names.
  const shown = new Set(view.arrows.flatMap((arrow) => arrow.technology));
  targets.push(...spread(model.technologies.filter((each) => shown.has(each.name)).map((each) => each.id).sort(byText), SOME));
  const tries = targets.flatMap((id) => [SHORT_NAME, LONG_NAME].map((name) => ({ kind: 'name', edit: withText(id, 'name', name) })));
  // A new description, for boxes spread over the view.
  const described = spread(idsOf(view.boxes).filter((id) => recordOf(model, id) !== undefined), SOME);
  tries.push(...described.map((id) => ({ kind: 'description', edit: withText(id, 'description', 'A new description, given for the trial of the layout. It has a second sentence.') })));
  return tries;
}

// The summary, the pass numbers and the tables.

/** The mean of the shares there are, with how many edits and pairs it rests on, and the worst; undefined when there is none. */
function shareOf(rows, key, pairsKey, worst = Math.min) {
  const there = rows.filter((row) => row[key] !== undefined);
  if (there.length === 0) return undefined;
  return {
    edits: there.length,
    pairs: there.reduce((sum, row) => sum + row[pairsKey], 0),
    mean: there.reduce((sum, row) => sum + row[key], 0) / there.length,
    worst: worst(...there.map((row) => row[key])),
  };
}

/** The shares of the tries of one view: the boxes moved, the pairs that kept their order, and those in a column. */
function sharesOf(tries) {
  if (tries === undefined) return undefined;
  const rows = tries.rows;
  return {
    tried: tries.tried,
    notReached: tries.notReached,
    gone: tries.gone,
    notDrawn: tries.notDrawn,
    measured: rows.length,
    noPair: rows.filter((row) => row.pairs === 0).length,
    moved: shareOf(rows, 'moved', 'common', Math.max),
    orderKept: shareOf(rows, 'orderKept', 'pairs'),
    columnOrder: shareOf(rows, 'columnOrder', 'columnPairs'),
  };
}

/** The numbers of each directory and of every directory together: edits are pooled, so that each counts once. */
function summaryOf(results) {
  for (const result of results) {
    result.shares = { containers: sharesOf(result.containers), context: sharesOf(result.context), others: result.others === undefined ? undefined : shareOf(result.others.rows, 'orderKept', 'pairs') };
  }
  const sum = (pick) => results.reduce((total, each) => total + (pick(each) ?? 0), 0);
  const pooled = (kind) => {
    const tries = newTries();
    for (const each of results) {
      const mine = each[kind];
      if (mine === undefined) continue;
      for (const key of ['tried', 'notReached', 'gone', 'notDrawn']) tries[key] += mine[key];
      tries.rows.push(...mine.rows.map((row) => ({ ...row, label: each.label })));
    }
    return { tries, shares: sharesOf(tries) };
  };
  const containers = pooled('containers');
  const context = pooled('context');
  const together = (kind) => sharesOf({ ...newTries(), rows: results.map((each) => each.together?.[kind]).filter((each) => typeof each === 'object') });
  const others = results.flatMap((each) => each.others?.rows ?? []);
  const mains = results.filter((each) => each.main !== undefined);
  const inColumn = containers.tries.rows.filter((row) => row.columnOrder !== undefined);
  const worstOf = (rows, adds) =>
    rows
      .filter((row) => ADDS.has(row.edit) === adds)
      .sort((a, b) => a.columnOrder - b.columnOrder)
      .slice(0, 3)
      .map((row) => ({ label: row.label, edit: row.edit, adds, common: row.common, columnPairs: row.columnPairs, columnTurned: row.columnTurned, columnOrder: row.columnOrder }));
  // The three worst edits that add, and the three worst that take out or move: both are shown.
  const worstInColumn = [...worstOf(inColumn, true), ...worstOf(inColumn, false)];
  const column = {
    adds: shareOf(inColumn.filter((row) => ADDS.has(row.edit)), 'columnOrder', 'columnPairs'),
    takes: shareOf(inColumn.filter((row) => !ADDS.has(row.edit)), 'columnOrder', 'columnPairs'),
  };
  return {
    views: sum((each) => each.views),
    differAgain: sum((each) => each.differAgain),
    differInOrder: sum((each) => each.differInOrder),
    layouts: sum((each) => each.tally.layouts),
    failed: sum((each) => each.tally.failed),
    slowestMs: Math.max(0, ...results.map((each) => each.tally.slowestMs)),
    walk: { pairs: sum((each) => each.tally.walk.pairs), against: sum((each) => each.tally.walk.against), views: sum((each) => each.tally.walk.views) },
    geometry: { pictures: sum((each) => each.tally.geometry.pictures), withTroubles: sum((each) => each.tally.geometry.withTroubles), troubles: sum((each) => each.tally.geometry.troubles) },
    crowded: { expected: sum((each) => each.crowded.expected), reported: sum((each) => each.crowded.reported), matched: sum((each) => each.crowded.matched), missing: sum((each) => each.crowded.missing), extra: sum((each) => each.crowded.extra) },
    renames: { tried: sum((each) => each.renames.tried), notReached: sum((each) => each.renames.notReached), moved: sum((each) => each.renames.moved) },
    descriptions: { tried: sum((each) => each.descriptions.tried), notReached: sum((each) => each.descriptions.notReached), moved: sum((each) => each.descriptions.moved) },
    shares: { containers: containers.shares, context: context.shares, others: shareOf(others, 'orderKept', 'pairs') },
    others: { edits: sum((each) => each.others?.edits), views: others.length, gone: sum((each) => each.others?.gone), added: sum((each) => each.others?.added), notDrawn: sum((each) => each.others?.notDrawn) },
    together: { containers: together('containers'), context: together('context') },
    worstInColumn,
    column,
    main: mains.length === 0 ? undefined : { crossings: sum((each) => each.main?.crossings), area: sum((each) => each.main?.area), slowestMs: Math.max(...mains.map((each) => each.main.slowestMs)) },
  };
}

/** A share in per cent to one decimal, rounded down, so that a share just under a pass number does not read as equal to it. */
function pc(share) {
  return share === undefined ? '-' : `${(Math.floor(share * 1000) / 10).toFixed(1)} %`;
}

/** A share with what it rests on: `84.9 % over 83 edits and 5,120 pairs`, and what the pairs are. */
function restsOn(share, which = '') {
  return share === undefined ? 'nothing to measure' : `${pc(share.mean)} over ${count(share.edits, 'edit')} and ${count(share.pairs, 'pair')}${which}`;
}

/** A number of things: `1 edit`, `5,120 pairs`, `3 tries`. */
function count(n, noun) {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? noun : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;
}

/** Each pass number of the spec, what was measured, and whether it passes, fails or was not tried. */
function passesOf(results, all) {
  const list = [];
  const add = (number, what, tried, passes, measured) => list.push({ number, what, status: !tried ? 'not tried' : passes ? 'passes' : 'fails', measured });
  add(
    1,
    'The same model, laid out again and in another order: no view differs',
    all.views > 0,
    all.differAgain === 0 && all.differInOrder === 0 && all.failed === 0,
    `${all.differAgain} differ again, ${all.differInOrder} in another order, ${all.failed} of ${count(all.layouts, 'layout')} not drawn, of ${count(all.views, 'view')}`,
  );
  const reached = (each) => each.tried - each.notReached;
  const tries = reached(all.renames) + reached(all.descriptions);
  const moved = all.renames.moved + all.descriptions.moved;
  add(2, 'A new name or a new description: nothing moves in any try', tries > 0, moved === 0, `${moved} of ${count(tries, 'try')} move something; ${all.renames.notReached + all.descriptions.notReached} not reached`);
  const column = all.shares.containers?.columnOrder;
  const adds = all.column.adds;
  const takes = all.column.takes;
  add(
    3,
    'One edit, container view: pairs in one column that keep their order: 95 % over all edits, 75 % in the worst edit that adds something',
    column !== undefined && adds !== undefined,
    column !== undefined && adds !== undefined && column.mean >= PASS.column && adds.worst >= PASS.columnWorst,
    column === undefined || adds === undefined
      ? 'no edit that adds something with a pair in one column'
      : `${restsOn(column, ' in one column')}; worst edit that adds something ${pc(adds.worst)}, of ${count(adds.edits, 'edit')}; worst edit that takes out or moves ${takes === undefined ? '-' : `${pc(takes.worst)}, of ${count(takes.edits, 'edit')}`}, which has no floor`,
  );
  const pairs = all.shares.containers?.orderKept;
  const each = results.filter((result) => result.shares?.containers?.orderKept !== undefined);
  const least = Math.min(...each.map((result) => result.shares.containers.orderKept.mean));
  add(
    4,
    'One edit, container view: pairs that keep their order both ways: 80 % over all models, 65 % in each model',
    pairs !== undefined,
    pairs !== undefined && pairs.mean >= PASS.pairs && least >= PASS.pairsEachModel,
    pairs === undefined ? 'no edit with a pair' : `${restsOn(pairs)}; least in a model ${pc(least)}, of ${count(each.length, 'model')} with an edit`,
  );
  const context = all.shares.context?.orderKept;
  add(5, 'One edit, context view: pairs that keep their order both ways: 80 % over all models', context !== undefined, context !== undefined && context.mean >= PASS.context, context === undefined ? 'no edit with a pair' : restsOn(context));
  add(6, 'The slowest layout: 2 seconds', all.layouts > 0, all.slowestMs <= PASS.slowest, `${(all.slowestMs / 1000).toFixed(2)} s, of ${count(all.layouts, 'layout')}`);
  const crowded = all.crowded;
  add(
    7,
    `A view of more than ${CROWDED} boxes: each is reported by the check, at its system's file, with its kind and its boxes, and no other`,
    crowded.expected + crowded.reported > 0,
    crowded.missing === 0 && crowded.extra === 0,
    `${crowded.matched} of ${count(crowded.expected, 'view')} reported as they should be, ${crowded.missing} missing, ${crowded.extra} other warnings`,
  );
  return list;
}

/** The tables, for a person. */
function printed(results, all, passes, limit) {
  const per = (share) => (share === undefined ? '-' : String(Math.floor(share * 100)));
  const rows = [...results.map((each) => ({ ...each, name: each.label })), { ...all, name: 'All', tally: all, notes: [] }];
  const lines = [];
  lines.push(
    `The layout tried on ${results.length} source ${results.length === 1 ? 'directory' : 'directories'}. Shares are in per cent, rounded down. A box has moved when its centre is more than half a box (${BOX_WIDTH / 2} by ${BOX_HEIGHT / 2} px) from where it stood, after the shift all boxes share. A share is the mean of each edit's own; an edit that does not reach a view, or leaves no pair, is in none.`,
    '',
  );
  if (limit !== undefined) lines.push(limit, '');

  lines.push(
    'The same picture, and new names',
    ...table(
      ['', 'Views', 'Differ again', 'In another order', 'Not drawn', 'Renames', 'Not reached', 'Moved', 'Descriptions', 'Not reached', 'Moved'],
      rows.map((row) => [row.name, row.views, row.differAgain, row.differInOrder, row.tally.failed, row.renames.tried, row.renames.notReached, row.renames.moved, row.descriptions.tried, row.descriptions.notReached, row.descriptions.moved]),
    ),
    '',
  );

  for (const [kind, title] of [
    ['containers', 'One edit, container view of the system with the largest'],
    ['context', 'One edit, context view of the same system'],
  ]) {
    const header = ['', 'Boxes', 'Edits', 'Not reached', 'Gone', 'Not drawn', 'No pair', 'Moved', 'Order kept', 'Of edits', 'Of pairs', 'In a column', 'Of edits', 'Of pairs', 'Worst kept', 'Worst in a column'];
    lines.push(
      title,
      ...table(
        header,
        rows.map((row) => {
          const s = row.shares?.[kind];
          if (s === undefined) return [row.name, '-', 0, ...Array(header.length - 3).fill('-')];
          return [row.name, row.main?.boxes?.[kind] ?? '', s.tried, s.notReached, s.gone, s.notDrawn, s.noPair, per(s.moved?.mean), per(s.orderKept?.mean), s.orderKept?.edits ?? 0, s.orderKept?.pairs ?? 0, per(s.columnOrder?.mean), s.columnOrder?.edits ?? 0, s.columnOrder?.pairs ?? 0, per(s.orderKept?.worst), per(s.columnOrder?.worst)];
        }),
      ),
      '',
    );
  }

  const worst = all.worstInColumn;
  if (worst.length > 0) {
    lines.push(
      'The worst edits of the container view in a column, for pass number 3: three that add something, which have a floor, and three that take out or move, which have none',
      ...table(
        ['', 'Edit', 'Floor', 'Common boxes', 'Pairs in a column', 'Turned round', 'Kept'],
        worst.map((row) => [row.label, row.edit, row.adds ? '75' : 'none', row.common, row.columnPairs, row.columnTurned, per(row.columnOrder)]),
      ),
      '',
    );
  }

  lines.push(
    'Five edits made together, each on the model the one before left: moved, order kept, in a column, with the pairs of each',
    ...table(
      ['', 'Edits', 'Container view', 'Context view'],
      rows.map((row) => {
        const cell = (shares) => (shares === undefined ? '-' : typeof shares === 'string' ? shares : `${per(shares.moved)}, ${per(shares.orderKept)} of ${shares.pairs}, ${per(shares.columnOrder)} of ${shares.columnPairs}`);
        if (row === rows.at(-1)) {
          const pooled = (s) => (s === undefined || s.measured === 0 ? '-' : `${per(s.moved?.mean)}, ${per(s.orderKept?.mean)} of ${s.orderKept?.pairs ?? 0}, ${per(s.columnOrder?.mean)} of ${s.columnOrder?.pairs ?? 0}`);
          return [row.name, results.reduce((total, each) => total + (each.together?.edits ?? 0), 0), pooled(all.together.containers), pooled(all.together.context)];
        }
        return [row.name, row.together?.edits ?? 0, cell(row.together?.containers), cell(row.together?.context)];
      }),
    ),
    '',
  );

  lines.push(
    'Other views of the model, after one edit that changes them: no pass number',
    ...table(
      ['', 'Edits', 'Views', 'Pairs', 'Order kept', 'Worst kept', 'Gone', 'New', 'Not drawn'],
      rows.map((row) => {
        const others = row === rows.at(-1) ? all.others : row.others;
        const share = row.shares?.others;
        if (others === undefined) return [row.name, ...Array(8).fill('-')];
        return [row.name, others.edits, row === rows.at(-1) ? others.views : others.rows.length, share?.pairs ?? 0, per(share?.mean), per(share?.worst), others.gone, others.added, others.notDrawn];
      }),
    ),
    '',
  );

  lines.push(
    'The two main views as they are, every layout made, and the views over the limit',
    ...table(
      ['', 'Crossings', 'Area, million px²', 'Slowest main, s', 'Layouts', 'Slowest of all, s', `Views over ${CROWDED} boxes`, 'Warnings', 'As they should be'],
      rows.map((row) => [
        row.name,
        row.main?.crossings ?? '-',
        row.main === undefined ? '-' : (row.main.area / 1e6).toFixed(1),
        row.main === undefined ? '-' : (row.main.slowestMs / 1000).toFixed(2),
        row.tally.layouts,
        (row.tally.slowestMs / 1000).toFixed(2),
        row.crowded.expected,
        row.crowded.reported,
        row.crowded.matched,
      ]),
    ),
    '',
  );

  lines.push(
    'Every layout against the walk, and the geometry of every picture compared',
    ...table(
      ['', 'Pairs in a column', 'Against the walk', 'Layouts with one', 'Pictures checked', 'With a fault', 'Faults'],
      rows.map((row) => [row.name, row.tally.walk.pairs, row.tally.walk.against, row.tally.walk.views, row.tally.geometry.pictures, row.tally.geometry.withTroubles, row.tally.geometry.troubles]),
    ),
    '',
  );

  const notes = results.flatMap((each) => each.notes.map((note) => `${each.label}: ${note}.`));
  if (notes.length > 0) lines.push(...notes, '');
  for (const each of passes) lines.push(`${each.number}  ${each.status.padEnd(9)}  ${each.what}. Measured: ${each.measured}.`);
  return lines.join('\n');
}

/** Rows of cells as lines, each column as wide as its widest cell: the first to the left, the others to the right. */
function table(header, rows) {
  const cells = [header, ...rows].map((row) => row.map(String));
  const widths = header.map((_, at) => Math.max(...cells.map((row) => (row[at] ?? '').length)));
  return cells.map((row) => row.map((cell, at) => (at === 0 ? cell.padEnd(widths[at]) : cell.padStart(widths[at]))).join('  ').trimEnd());
}

await main();
