// Tries how steady the layout is on source directories, for the trial of a stage: whether the
// same model gives the same picture in every setting, whether new words move nothing, how much
// of the order one edit keeps, how much of it a change of depth keeps, and whether the two
// pictures of stage 5 are still what the code of stage 8 made. It measures the pass numbers of
// `docs/depth-and-scope.md`, "What must be true": 1 to 6, 8 to 20, 22 and 23. Number 21, the box
// kept in place at a change of depth, is the page's, and is not measured here. It is run by
// hand, not by `npm run check`, since it takes long: about 20 minutes on the eight trial models
// with every pass number, some 12,000 layouts, where numbers 17 to 20 alone take 15 seconds. It
// is not part of the installed command.
//
//   node scripts/steady.mjs <directory> [<directory> ...] [--only=<numbers>] [--before=<folder>] [--json]
//
// `--only=1,8-12` tries those pass numbers alone, and lays out only what they need: numbers 1,
// 2, 6, 22 and 23 need every setting, numbers 3 to 5 and 8 to 16 the edits, 17 to 20 the
// settings of a change of depth. `--before=<folder>` names a folder with one file for each
// directory tried, holding the pictures the code of stage 8 made of that directory's views of
// stage 5: `{ views, pictures }`, as that code gave them. The file of a directory is named as the
// directory, or as the nearest folder above it that has one: `shop.json` for
// `models/shop/architecture`. Without it, the first half of number 22 is not tried.
//
// It runs from the repository's root with no build: it reads the sources of the core library,
// the command and the layout, and Node strips their types itself, as it does for the tests.
// Each layout runs in a worker thread of the layout package under its time limit, as the
// server runs it, and is handed the views above it, nearest first, as `Views.above` names
// them: a picture laid out without them is not the picture of the spec.
//
// Each directory must be sound. One that cannot be read, or in which `seefore check` finds an
// error, ends the run before anything is laid out. An empty folder is such a one: it has no
// marker. So does one that `--before` has no file for.
//
// What it tries, for each directory:
//
// - Every setting laid out twice, and once more with the files read in the opposite order and
//   the boxes, boundaries and arrows of the view and of the views above it handed over
//   shuffled, in another thread. Every picture's geometry is checked.
// - New words. One at a time, on the two pictures of stage 5 of the largest system, as stage 7
//   tried them: a new name for every box, the system itself and every thing on a route, for
//   some connections alone on an arrow and some among several, and for some technologies, once
//   a short name and once one of `NAME_MAX` characters, the longest a name may be; and a new
//   description for some boxes. And at once, on every setting: every name of the model short,
//   every name as long as a name may be, and every description new. Nothing may move, the
//   middle of every label among it.
// - The edits of stage 7, one at a time, around the largest system: the system whose container
//   view has the most boxes, the first by id of those with as many. An app added, taken out or
//   moved to another system; a store added or taken out; a connection added or taken out,
//   between two boxes inside and between the system and a neighbour; a new system outside. Each
//   is compared on the two pictures of stage 5 of that system; on everything at each depth; on
//   that system at Component depth; and on the app with the most components, the first by id of
//   those with as many, chosen at Component depth. And on every other picture of stage 5 that
//   the edit changes, with no pass number.
// - Five of those edits made together, on the two pictures of stage 5, with no pass number.
// - A component of that app added, taken out or moved to another app, compared on everything,
//   on the app's system and on the app, each at Component depth.
// - Every change of depth, with no edit: the picture of a setting and that of the same scope one
//   depth down. One that opens a box is measured, a box that opens taken at its boundary; one
//   that opens nothing must give the same picture.
// - With `--before`, the two pictures of stage 5, their views and their pictures, against what
//   the code of stage 8 made of them: only what stage 9 renamed may differ.
// - Every layout made, of a setting as read or edited, is timed for number 6 and held to its
//   turns for number 23: the pairs of boxes of one column inside one boundary, or outside every
//   boundary, must stand in the order of the turns the layout took.
//
// How the targets of an edit are picked: from the model alone, never from a picture, so that a
// directory gets the same edits under any layout, as `steady-edits.mjs` says. Every edited model
// is checked as `seefore check` checks a directory, before it is laid out. One that is not sound
// is a fault of this script, and the run stops.
//
// How a share is made. For each edit, the share of its pairs of boxes that keep their order:
// both ways, over the pairs of boxes that stand in both pictures; in a column, over the pairs
// that stand in one column in both; inside one boundary, over the pairs that stand inside the
// same boundary in both. Two boxes at the same height stand neither way round, and a pair keeps
// its order when both pictures have it so. A share over many edits is the mean of each edit's
// own share, each edit counting once whatever its number of pairs; a change of depth is counted
// as an edit is. An edit with no pair is in no share; nor is one that does not reach the
// picture, whose view and views above go to the layout as they were: those are counted apart. A
// pass number with nothing to measure is not tried, and that is not a pass. Shares are compared
// with the pass numbers as measured, and rounded down only to be printed.
//
// The floor of the worst edit in a column, of number 3 and the bars of 3 and 4, is for the edits
// that add something. An edit that takes something out or moves a box may take away a box that
// the walk passes early, and no order taken from the arrows holds through that: the worst of
// those is printed beside the other, with no floor.
//
// It prints a table for each measure, with a row for each directory and one for all, and then
// each pass number with what was measured, its bar, and "passes", "fails" or "not tried". With
// `--json` it prints the same as data. It prints counts and shares only, never a name or an id
// from a model, so that its tables can be shown for a model that is not public.
//
// Exit code: 0 when every pass number asked for passes; 1 when one fails or is not tried; 2 when a
// directory cannot be tried, or the options are wrong; 3 when the script made an edited model
// that is not sound.
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { parseArgs, isDeepStrictEqual } from 'node:util';
import { MARKER_FILE, keyOf, load } from '../packages/core/src/index.ts';
import { asOfStage5 } from '../packages/core/test/stage-5.ts';
import { isDirectory, readSourceFiles } from '../packages/cli/src/directory.ts';
import { graphOf, sorted, turnsFrom } from '../packages/layout/src/graph.ts';
import { LAYOUT_LIMIT, startRunner } from '../packages/layout/src/node.ts';
import { BOX_HEIGHT, BOX_WIDTH } from '../packages/layout/src/sizes.ts';
import { boxText, labelText } from '../packages/layout/src/text.ts';
import { againstWalk, change, columnPairs, crossings, placesOf } from '../packages/layout/test/change.ts';
import { nesting, troubles } from '../packages/layout/test/geometry.ts';
import { ADDS, EDITS, TOGETHER, WORDS, appWithComponents, byText, componentEdits, largestOf, lookupOf, renamesOf, settingIn, singleEdits, stage5Of } from './steady-edits.mjs';

/** The pass numbers of `docs/depth-and-scope.md`, "What must be true", that the script measures. */
const NUMBERS = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 22, 23];
/** Their bars. "The bars of 3 and 4" are `column`, `columnWorst` and `pairs`. */
const PASS = {
  column: 0.95,
  columnWorst: 0.75,
  pairs: 0.8,
  pairsEachModel: 0.65,
  context: 0.8,
  slowest: 2000,
  bothWays: 0.8,
  inside: 0.8,
  depth: { 17: [0.75, 0.5], 18: [0.8, 0.75], 19: [0.8, 0.6], 20: [0.9, 0.8] },
};
/** The exit codes. */
const EXIT = { passes: 0, misses: 1, cannot: 2, fault: 3 };
const USAGE = 'usage: node scripts/steady.mjs <directory> [<directory> ...] [--only=<numbers>] [--before=<folder>] [--json]';

/** The depth one down from each, which a change of depth goes to. */
const DEEPER = { system: 'container', container: 'component' };

/** The changes of depth that open something and have a pass number, by the number: a scope and the depth it goes down from. */
const CHANGES = { 17: 'everything-system', 18: 'everything-container', 19: 'system-container', 20: 'app-container' };

/** What the script did wrong. It ends the run with its own exit code, and says so. */
class Fault extends Error {}

/** Tries every directory, prints what it found, and sets the exit code of the pass numbers. */
async function main() {
  let parsed;
  try {
    parsed = parseArgs({ allowPositionals: true, options: { json: { type: 'boolean', default: false }, only: { type: 'string' }, before: { type: 'string' } } });
  } catch (error) {
    return cannot(`${error.message}\n${USAGE}`);
  }
  const { values, positionals } = parsed;
  if (positionals.length === 0) return cannot(USAGE);
  const numbers = values.only === undefined ? new Set(NUMBERS) : numbersOf(values.only);
  if (typeof numbers === 'string') return cannot(`${numbers}\n${USAGE}`);
  const plan = planOf(numbers, values.before !== undefined);
  const directories = positionals.map((each) => resolve(each));
  const labels = labelsOf(directories);
  const sources = [];
  for (const [at, directory] of directories.entries()) {
    const source = sourceOf(directory, labels[at], positionals[at]);
    if (typeof source === 'string') return cannot(source);
    if (values.before !== undefined && plan.before) {
      const before = beforeOf(resolve(values.before), directory, positionals[at]);
      if (typeof before === 'string') return cannot(before);
      source.before = before;
    }
    sources.push(source);
  }

  const worker = new URL('../packages/layout/src/worker.ts', import.meta.url);
  const runners = { first: startRunner({ worker, limit: LAYOUT_LIMIT }), other: startRunner({ worker, limit: LAYOUT_LIMIT }) };
  const results = [];
  try {
    // A thread starts and loads ELK with its first layout: that time is not the layout's.
    const warm = { id: 'system~warm', depth: 'system', scope: 'warm', title: '', boxes: [], boundaries: [], arrows: [], left: { outside: [], broken: [] }, legend: [], passed: [] };
    await runners.first.layOut(warm);
    await runners.other.layOut(warm);
    for (const source of sources) results.push(await tryDirectory(source, runners, plan));
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
  const passes = passesOf(results, all, plan);
  // Written, and the exit code set, without ending the process: a pipe takes its time to drain.
  const text = values.json ? JSON.stringify({ directories: results, all, passes }, null, 1) : printed(results, all, passes, plan);
  process.stdout.write(`${text}\n`);
  process.exitCode = passes.every((each) => each.status === 'passes') ? EXIT.passes : EXIT.misses;
}

/** Says why the run cannot start, and ends it with the exit code for that. */
function cannot(sentence) {
  console.error(sentence);
  process.exitCode = EXIT.cannot;
}

/** The pass numbers that `--only` names, as `1,8-12`, or the sentence that says what is wrong with them. */
function numbersOf(text) {
  const numbers = new Set();
  for (const part of text.split(',')) {
    const range = /^(\d+)(?:-(\d+))?$/.exec(part.trim());
    if (range === null) return `--only takes pass numbers and ranges of them, as 1,8-12: "${part}" is neither.`;
    const [from, to] = [Number(range[1]), Number(range[2] ?? range[1])];
    for (let number = from; number <= to; number++) {
      if (number === 7) return 'Number 7, a crowded view, went with the check at stage 9.';
      if (number === 21) return 'Number 21, the box kept in place at a change of depth, is the page\'s: this script cannot measure it.';
      if (!NUMBERS.includes(number)) return `There is no pass number ${number}. The script measures ${NUMBERS.join(', ')}.`;
      numbers.add(number);
    }
  }
  return numbers;
}

/** What the run lays out and measures, for the pass numbers asked for. */
function planOf(numbers, before) {
  const any = (...list) => list.some((number) => numbers.has(number));
  return {
    numbers,
    every: any(1, 2, 6, 22, 23),
    again: any(1),
    words: any(2),
    main: any(3, 4, 5),
    whole: any(8, 9, 10, 11, 12, 13, 14, 16),
    components: any(15),
    depth: any(17, 18, 19, 20, 22),
    changes: new Set([...Object.entries(CHANGES).filter(([number]) => numbers.has(Number(number))).map(([, kind]) => kind), ...(any(17, 18, 19, 20) ? ['system-system', 'other'] : []), ...(any(22) ? ['none'] : [])]),
    before: any(22) && before,
  };
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

/**
 * The pictures the code of stage 8 made of a directory's views, from the folder `--before`
 * names, or the sentence that says why there are none. The file is named as the directory, or as
 * the nearest folder above it that has one.
 */
function beforeOf(folder, directory, given) {
  for (let at = directory; ; at = dirname(at)) {
    const name = basename(at);
    const path = join(folder, `${name}.json`);
    if (name !== '' && existsSync(path)) {
      try {
        const read = JSON.parse(readFileSync(path, 'utf8'));
        if (Array.isArray(read.views) && Array.isArray(read.pictures) && read.views.length === read.pictures.length) return read;
      } catch {
        // Said below, as for a file of another shape.
      }
      return `${path} does not hold the views and pictures of stage 8 as { views, pictures }, so ${given} cannot be compared with them.`;
    }
    if (dirname(at) === at) return `${folder} has no file of the pictures of stage 8 for ${given}: one named as that folder, or as a folder above it, with .json after.`;
  }
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
 * is given, with the turns taken from the views above, and the words it then puts in each box,
 * label and title. The same text means the same picture. What the page alone reads of a view,
 * as the connections held inside a box, is not in it: an edit that changes only that does not
 * reach the layout.
 */
function inputOf(view, above) {
  const input = sorted(view);
  const labels = new Map();
  for (const arrow of input.arrows) {
    const label = labelText(arrow);
    if (label !== undefined) labels.set(arrow.id, label);
  }
  const boundaries = input.boundaries.map((boundary) => [boundary.name, boundary.line, boundary.title, boundary.only]);
  return JSON.stringify({ graph: graphOf(input, labels, turnsFrom(input, above)), boxes: input.boxes.map(boxText), boundaries, labels: [...labels] });
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

/** A view with its boxes, boundaries and arrows handed over in a fixed shuffle. */
function shuffledView(view) {
  return { ...view, boxes: shuffled(view.boxes, 7), boundaries: shuffled(view.boundaries, 13), arrows: shuffled(view.arrows, 11) };
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

/**
 * Checks the geometry of a picture once, and counts what is wrong with it: a box, a line or a
 * label over another, and a box or a boundary outside the boundary it is in.
 */
function checkGeometry(tally, view, drawn) {
  if (checked.has(drawn)) return;
  checked.add(drawn);
  const found = troubles(drawn).length + nesting(view, drawn).length;
  tally.geometry.pictures += 1;
  if (found > 0) tally.geometry.withTroubles += 1;
  tally.geometry.troubles += found;
}

/**
 * The picture of a view laid out from the views above it, or undefined when it was not drawn.
 * It counts the time, which is the layout's own since one layout is asked for at a time, and
 * the pairs of one column of one boundary, or outside every boundary, that stand against the
 * turns the layout took.
 */
async function layOutOn(tally, view, above, by) {
  const started = performance.now();
  const picture = await by.layOut(view, above);
  const ms = performance.now() - started;
  tally.layouts += 1;
  tally.slowestMs = Math.max(tally.slowestMs, ms);
  if ('failed' in picture) {
    tally.failed += 1;
    return { drawn: undefined, ms };
  }
  const against = againstWalk(view, picture, above).length;
  tally.walk.pairs += columnPairs(view, picture, above).length;
  tally.walk.against += against;
  if (against > 0) tally.walk.views += 1;
  return { drawn: picture, ms };
}

/** The tries of one measure: how many there were, how many were set apart and why, the size of the picture before, and the change of each that was measured. */
function newTries(boxes) {
  return { tried: 0, notReached: 0, gone: 0, notDrawn: 0, boxes, rows: [] };
}

/** What every part of the trial of one directory shares: the model, its views, the layouts made, and the picture of each setting as read. */
function trialOf(source, runners) {
  const model = source.loaded.model;
  return { source, model, lookup: lookupOf(model), runners, tally: newTally(), first: new Map() };
}

/**
 * A setting of the model as read: its view, the views above it and its picture, laid out once
 * from them and kept, with its geometry checked. Undefined when the model does not have it. The
 * picture is undefined when it was not drawn.
 */
async function asRead(trial, setting) {
  const key = keyOf(setting);
  if (!trial.first.has(key)) {
    const view = trial.lookup.viewOf(setting);
    if (view === undefined) {
      trial.first.set(key, undefined);
    } else {
      const above = trial.lookup.aboveOf(setting);
      const laid = await layOutOn(trial.tally, view, above, trial.runners.first);
      if (laid.drawn !== undefined) checkGeometry(trial.tally, view, laid.drawn);
      trial.first.set(key, { setting, view, above, drawn: laid.drawn, ms: laid.ms });
    }
  }
  return trial.first.get(key);
}

/** What the layout is handed for a setting as read, worked out once. */
function inputFor(read) {
  read.input ??= inputOf(read.view, read.above);
  return read.input;
}

/** Where a picture as read stands without its words, worked out once. */
function placesFor(read) {
  read.places ??= placesOf(read.drawn);
  return read.places;
}

/**
 * One edit tried on one setting: its picture after the edit and the change from the picture as
 * read, or undefined when the setting is gone, its view and the views above go to the layout as
 * they were, or a picture was not drawn, each of which is counted on the tries.
 */
async function triedOn(trial, tries, read, edited, setting) {
  tries.tried += 1;
  const after = settingIn(edited, setting);
  if (read === undefined || after === undefined) {
    tries.gone += 1;
    return undefined;
  }
  if (inputOf(after.view, after.above) === inputFor(read)) {
    tries.notReached += 1;
    return undefined;
  }
  const drawn = (await layOutOn(trial.tally, after.view, after.above, trial.runners.first)).drawn;
  if (drawn === undefined || read.drawn === undefined) {
    tries.notDrawn += 1;
    return undefined;
  }
  checkGeometry(trial.tally, after.view, drawn);
  return { view: after.view, drawn, change: change(read.drawn, drawn) };
}

/** Everything the script measures on one source directory. */
async function tryDirectory(source, runners, plan) {
  const trial = trialOf(source, runners);
  const settings = trial.lookup.settings();
  const result = {
    label: source.label,
    settings: settings.length,
    differAgain: 0,
    differInOrder: 0,
    renames: { tried: 0, notReached: 0, moved: 0 },
    descriptions: { tried: 0, notReached: 0, moved: 0 },
    words: { tried: 0, notReached: 0, moved: 0 },
    main: undefined,
    containers: undefined,
    context: undefined,
    together: undefined,
    others: undefined,
    whole: undefined,
    components: undefined,
    depth: undefined,
    same: undefined,
    stage8: undefined,
    sizes: undefined,
    tally: trial.tally,
    notes: [],
  };
  soundOrStop(trial.model, source, 'the model as read, written back');
  // What it is doing, and how long the run has taken, for a person who waits.
  const say = (what) => process.stderr.write(`${source.label}: ${what}, at ${Math.floor(performance.now() / 60000)} min ${Math.floor((performance.now() / 1000) % 60)} s\n`);

  if (plan.every) {
    say('every setting');
    await trySame(trial, result, plan);
  }
  const scope = largestOf(trial.model);
  const app = appWithComponents(trial.model);
  if (scope === undefined && (plan.main || plan.whole)) result.notes.push('no system opens at Container depth, so no edit is tried');
  if (app === undefined && (plan.whole || plan.components)) result.notes.push('no app has a component, so none is chosen at Component depth');
  if (plan.words) {
    say('new words');
    await tryWords(trial, result, scope);
  }
  const edits = scope === undefined || !(plan.main || plan.whole) ? [] : singleEdits(trial.model, scope);
  for (const edit of edits) soundOrStop(edit.model, source, `${edit.kind} at target ${edit.at + 1}`);
  if (plan.main && scope !== undefined) {
    say('one edit, the pictures of stage 5');
    await tryMain(trial, result, scope, edits);
  }
  if (plan.whole && scope !== undefined) {
    say('one edit, everything at each depth');
    await tryWhole(trial, result, scope, app, edits);
  }
  if (plan.components && app !== undefined) {
    say('a component');
    await tryComponents(trial, result, app);
  }
  if (plan.depth) {
    say('every change of depth');
    await tryDepth(trial, result, plan);
  }
  if (plan.before) await tryBefore(trial, result);
  result.sizes = sizesOf(trial);
  return result;
}

/** Every setting laid out, and with number 1 laid out again and in another order in another thread. */
async function trySame(trial, result, plan) {
  const reversed = load([...trial.source.read.files].reverse()).model;
  for (const setting of trial.lookup.settings()) {
    const read = await asRead(trial, setting);
    if (!plan.again) continue;
    const again = await layOutOn(trial.tally, read.view, read.above, trial.runners.first);
    const turned = settingIn(reversed, setting);
    const mixed = turned === undefined ? undefined : await layOutOn(trial.tally, shuffledView(turned.view), turned.above.map(shuffledView), trial.runners.other);
    if (read.drawn === undefined) continue;
    if (JSON.stringify(again.drawn) !== JSON.stringify(read.drawn)) result.differAgain += 1;
    if (JSON.stringify(mixed?.drawn) !== JSON.stringify(read.drawn)) result.differInOrder += 1;
  }
}

/** New words: one at a time on the two pictures of stage 5 of the largest system, and every name or description at once on every setting. Nothing may move. */
async function tryWords(trial, result, scope) {
  const main = scope === undefined ? [] : [{ depth: 'container', scope }, { depth: 'system', scope }];
  for (const setting of main) {
    const read = await asRead(trial, setting);
    if (read?.drawn === undefined) continue;
    for (const rename of renamesOf(trial.model, read.view)) {
      const edited = rename.edit(trial.model);
      soundOrStop(edited, trial.source, `a new ${rename.kind}`);
      await triedWords(trial, rename.kind === 'description' ? result.descriptions : result.renames, read, edited, setting);
    }
  }
  for (const words of WORDS) {
    const edited = words.edit(trial.model);
    soundOrStop(edited, trial.source, words.what);
    for (const setting of trial.lookup.settings()) await triedWords(trial, result.words, await asRead(trial, setting), edited, setting);
  }
}

/** New words tried on one setting: counted as not reached when the layout is handed what it was, and as moved when anything stands elsewhere or was not drawn. */
async function triedWords(trial, into, read, edited, setting) {
  into.tried += 1;
  const after = settingIn(edited, setting);
  if (after === undefined || inputOf(after.view, after.above) === inputFor(read)) {
    into.notReached += 1;
    return;
  }
  const picture = (await layOutOn(trial.tally, after.view, after.above, trial.runners.first)).drawn;
  if (picture !== undefined) checkGeometry(trial.tally, after.view, picture);
  if (picture === undefined || read.drawn === undefined || placesOf(picture) !== placesFor(read)) into.moved += 1;
}

/** One edit at a time on the two pictures of stage 5 of the largest system, and on every other picture of stage 5 it changes; then five edits together. */
async function tryMain(trial, result, scope, edits) {
  const settings = { containers: { depth: 'container', scope }, context: { depth: 'system', scope } };
  const main = { containers: await asRead(trial, settings.containers), context: await asRead(trial, settings.context) };
  if (main.containers.drawn === undefined || main.context.drawn === undefined) {
    result.notes.push('its main views were not drawn, so no edit is tried on them');
    return;
  }
  result.main = {
    boxes: { containers: main.containers.view.boxes.length, context: main.context.view.boxes.length },
    crossings: crossings(main.containers.drawn) + crossings(main.context.drawn),
    area: main.containers.drawn.width * main.containers.drawn.height + main.context.drawn.width * main.context.drawn.height,
    slowestMs: Math.max(main.containers.ms, main.context.ms),
  };
  result.containers = newTries(main.containers.view.boxes.length);
  result.context = newTries(main.context.view.boxes.length);
  const mains = new Set(Object.values(settings).map(keyOf));
  const others = { edits: 0, gone: 0, added: 0, notDrawn: 0, rows: [] };
  const stage5 = new Set(stage5Of(trial.model).map(keyOf));
  for (const edit of edits) {
    for (const kind of ['containers', 'context']) {
      const row = await triedOn(trial, result[kind], main[kind], edit.model, settings[kind]);
      if (row !== undefined) result[kind].rows.push({ edit: edit.kind, at: edit.at, ...row.change });
    }
    const now = stage5Of(edit.model).filter((setting) => !mains.has(keyOf(setting)));
    let reached = false;
    for (const setting of now) {
      if (!stage5.has(keyOf(setting))) {
        others.added += 1;
        continue;
      }
      const read = await asRead(trial, setting);
      const after = settingIn(edit.model, setting);
      if (read?.drawn === undefined || inputOf(after.view, after.above) === inputFor(read)) continue;
      reached = true;
      const drawn = (await layOutOn(trial.tally, after.view, after.above, trial.runners.first)).drawn;
      if (drawn === undefined) {
        others.notDrawn += 1;
        continue;
      }
      checkGeometry(trial.tally, after.view, drawn);
      others.rows.push({ edit: edit.kind, at: edit.at, ...change(read.drawn, drawn) });
    }
    const kept = new Set(now.map(keyOf));
    for (const key of stage5) if (!mains.has(key) && !kept.has(key)) others.gone += 1;
    if (reached) others.edits += 1;
  }
  result.others = others;
  if (result.containers.rows.length === 0 && result.context.rows.length === 0) result.notes.push('no edit could be measured on its main views');

  // Five edits together, each worked out on the model the one before left.
  let edited = trial.model;
  const kinds = [];
  for (const [kind, at] of TOGETHER) {
    const edit = EDITS[kind](edited, scope, at);
    if (edit === undefined) continue;
    soundOrStop(edit.model, trial.source, `${kind} at target ${at + 1} of the edits made together, after ${kinds.length}`);
    edited = edit.model;
    kinds.push(kind);
  }
  if (kinds.length > 0) {
    result.together = { edits: kinds.length, kinds };
    for (const kind of ['containers', 'context']) {
      const tries = newTries();
      const row = await triedOn(trial, tries, main[kind], edited, settings[kind]);
      result.together[kind] = row?.change ?? (tries.gone > 0 ? 'gone' : tries.notReached > 0 ? 'not reached' : 'not drawn');
    }
  }
}

/** The settings of numbers 8 to 14 and 16, by the name of their measure: everything at each depth, the largest system and the app with the most components at Component depth. */
function wholeSettingsOf(scope, app) {
  return [
    ['system', { depth: 'system', scope: null }],
    ['container', { depth: 'container', scope: null }],
    ['component', { depth: 'component', scope: null }],
    ['systemComponent', { depth: 'component', scope }],
    ...(app === undefined ? [] : [['appComponent', { depth: 'component', scope: app }]]),
  ];
}

/** True when a view has a boundary inside a boundary. */
function nestedIn(view) {
  return view.boundaries.some((boundary) => boundary.boundary !== undefined);
}

/**
 * Of the pairs of boxes that stand inside the same boundary in both pictures, how many there
 * are and the share that keep their order both ways, as `change` counts it, boundary by
 * boundary. The share is missing when there is no such pair.
 */
function insideOf(read, after) {
  const was = new Map(read.view.boxes.map((box) => [box.id, box.boundary]));
  const groups = new Map();
  for (const box of after.view.boxes) if (box.boundary !== undefined && was.get(box.id) === box.boundary) groups.set(box.boundary, [...(groups.get(box.boundary) ?? []), box.id]);
  let pairs = 0;
  let kept = 0;
  for (const ids of groups.values()) {
    const keep = new Set(ids);
    const part = change({ ...read.drawn, boxes: read.drawn.boxes.filter((box) => keep.has(box.id)) }, { ...after.drawn, boxes: after.drawn.boxes.filter((box) => keep.has(box.id)) });
    pairs += part.pairs;
    kept += Math.round((part.orderKept ?? 0) * part.pairs);
  }
  return { insidePairs: pairs, insideKept: pairs === 0 ? undefined : kept / pairs };
}

/** One edit at a time on the settings of numbers 8 to 14 and 16. */
async function tryWhole(trial, result, scope, app, edits) {
  const settings = wholeSettingsOf(scope, app);
  const reads = new Map();
  for (const [name, setting] of settings) reads.set(name, await asRead(trial, setting));
  result.whole = Object.fromEntries(settings.map(([name]) => [name, newTries(reads.get(name)?.view.boxes.length)]));
  for (const edit of edits) {
    for (const [name, setting] of settings) {
      const read = reads.get(name);
      const row = await triedOn(trial, result.whole[name], read, edit.model, setting);
      if (row === undefined) continue;
      result.whole[name].rows.push({
        edit: edit.kind,
        at: edit.at,
        ...row.change,
        boundaries: [read.view.boundaries.length, row.view.boundaries.length],
        nested: [nestedIn(read.view), nestedIn(row.view)],
        ...(name === 'container' || name === 'component' ? insideOf(read, row) : {}),
      });
    }
  }
}

/** A component of the app with the most components added, taken out or moved: everything, the app's system and the app, at Component depth. */
async function tryComponents(trial, result, app) {
  const system = trial.model.apps.find((each) => each.id === app)?.in;
  const settings = [
    ['everything', { depth: 'component', scope: null }],
    ['system', { depth: 'component', scope: system }],
    ['app', { depth: 'component', scope: app }],
  ];
  result.components = newTries();
  for (const edit of componentEdits(trial.model, app)) {
    soundOrStop(edit.model, trial.source, `${edit.kind} at target ${edit.at + 1}`);
    for (const [where, setting] of settings) {
      const row = await triedOn(trial, result.components, await asRead(trial, setting), edit.model, setting);
      if (row !== undefined) result.components.rows.push({ edit: edit.kind, at: edit.at, where, ...row.change });
    }
  }
}

/** The kind of a change of depth from a setting: what is chosen and the depth it goes down from, or `none` when it opens nothing. */
function changeKindOf(setting, family, opens) {
  if (!opens) return 'none';
  const chosen = setting.scope === null ? 'everything' : family === 'systems' ? 'system' : family === 'apps' ? 'app' : undefined;
  const kind = chosen === undefined ? undefined : `${chosen}-${setting.depth}`;
  return kind !== undefined && (Object.values(CHANGES).includes(kind) || kind === 'system-system') ? kind : 'other';
}

/**
 * Every change of depth, with no edit: the picture of a setting and that of the same scope one
 * depth down. One that opens a box is measured on the pairs of boxes in both pictures, a box
 * that opens taken at its boundary; and on the boxes alone, as Astra's trial took it, with no
 * pass number. One that opens nothing must give the same picture.
 */
async function tryDepth(trial, result, plan) {
  const families = new Map(trial.lookup.scopes.map((scope) => [scope.id, scope.family]));
  const depth = Object.fromEntries([...Object.values(CHANGES), 'system-system', 'other'].map((kind) => [kind, { notDrawn: 0, rows: [] }]));
  const same = { tried: 0, differ: 0, notDrawn: 0 };
  for (const setting of trial.lookup.settings()) {
    const down = DEEPER[setting.depth];
    if (down === undefined) continue;
    const deeper = { depth: down, scope: setting.scope };
    const upper = trial.lookup.viewOf(setting);
    const lower = trial.lookup.viewOf(deeper);
    if (lower === undefined) continue;
    const boxes = new Set(upper.boxes.map((box) => box.id));
    const opened = lower.boundaries.filter((boundary) => boxes.has(boundary.id));
    const kind = changeKindOf(setting, families.get(setting.scope), opened.length > 0);
    if (!plan.changes.has(kind)) continue;
    const before = await asRead(trial, setting);
    const after = await asRead(trial, deeper);
    if (before.drawn === undefined || after.drawn === undefined) {
      (kind === 'none' ? same : depth[kind]).notDrawn += 1;
      continue;
    }
    if (kind === 'none') {
      same.tried += 1;
      if (JSON.stringify({ ...before.drawn, view: '' }) !== JSON.stringify({ ...after.drawn, view: '' })) same.differ += 1;
      continue;
    }
    const ids = new Set(opened.map((boundary) => boundary.id));
    const taken = change(before.drawn, { ...after.drawn, boxes: [...after.drawn.boxes, ...after.drawn.boundaries.filter((boundary) => ids.has(boundary.id))] });
    const alone = change(before.drawn, after.drawn);
    depth[kind].rows.push({ opened: ids.size, common: taken.common, pairs: taken.pairs, orderKept: taken.orderKept, alonePairs: alone.pairs, aloneKept: alone.orderKept });
  }
  result.depth = depth;
  if (plan.changes.has('none')) result.same = same;
}

/** A value as JSON has it, with no key that holds nothing: what the code of stage 8 wrote went through JSON. */
function asJson(value) {
  return JSON.parse(JSON.stringify(value));
}

/** The picture of a setting as the code of stage 8 gave it: under the view's old id, and with one boundary where it now has a list. */
function asOfStage8(drawn, id) {
  const { boundaries, view: _, ...rest } = drawn;
  return { ...rest, view: id, ...(boundaries[0] === undefined ? {} : { boundary: boundaries[0] }) };
}

/**
 * The two pictures of stage 5, against what the code of stage 8 made of them: each view as stage
 * 8 had it, which leaves out only what stage 9 renamed and what it adds to the boundary, and each
 * picture with its renames undone. A picture of stage 5 that one side has and the other does not
 * differs too.
 */
async function tryBefore(trial, result) {
  const old = trial.source.before;
  const stage8 = { compared: 0, missing: 0, viewsDiffer: 0, picturesDiffer: 0, notInFile: 0 };
  const seen = new Set();
  for (const [at, view] of old.views.entries()) {
    stage8.compared += 1;
    const setting = { depth: view.kind === 'context' ? 'system' : 'container', scope: view.scope };
    seen.add(keyOf(setting));
    const read = await asRead(trial, setting);
    if (read === undefined) {
      stage8.missing += 1;
      continue;
    }
    if (!isDeepStrictEqual(asJson(asOfStage5(read.view)), view)) stage8.viewsDiffer += 1;
    if (read.drawn === undefined || read.drawn.boundaries.length > 1 || !isDeepStrictEqual(asJson(asOfStage8(read.drawn, view.id)), old.pictures[at])) stage8.picturesDiffer += 1;
  }
  for (const setting of stage5Of(trial.model)) if (!seen.has(keyOf(setting))) stage8.notInFile += 1;
  result.stage8 = stage8;
}

/** The size of the largest picture laid out of the model as read, and the crossings of everything at each depth, where it was laid out. */
function sizesOf(trial) {
  const reads = [...trial.first.values()].filter((read) => read?.drawn !== undefined);
  const largest = reads.sort((a, b) => b.view.boxes.length - a.view.boxes.length || b.view.arrows.length - a.view.arrows.length)[0];
  const everything = (depth) => {
    const read = trial.first.get(keyOf({ depth, scope: null }));
    return read?.drawn === undefined ? undefined : crossings(read.drawn);
  };
  return {
    largest: largest === undefined ? undefined : { boxes: largest.view.boxes.length, arrows: largest.view.arrows.length, boundaries: largest.view.boundaries.length },
    crossings: { system: everything('system'), container: everything('container'), component: everything('component') },
  };
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

/**
 * The shares of the tries of one measure: the boxes moved, the pairs that kept their order, and
 * those in a column, with the worst in a column of the edits that add something and of those
 * that take out or move.
 */
function sharesOf(tries) {
  if (tries === undefined) return undefined;
  const rows = tries.rows;
  const inColumn = rows.filter((row) => row.columnOrder !== undefined);
  return {
    tried: tries.tried,
    notReached: tries.notReached,
    gone: tries.gone,
    notDrawn: tries.notDrawn,
    boxes: tries.boxes,
    measured: rows.length,
    noPair: rows.filter((row) => row.pairs === 0).length,
    moved: shareOf(rows, 'moved', 'common', Math.max),
    orderKept: shareOf(rows, 'orderKept', 'pairs'),
    columnOrder: shareOf(rows, 'columnOrder', 'columnPairs'),
    adds: shareOf(inColumn.filter((row) => ADDS.has(row.edit)), 'columnOrder', 'columnPairs'),
    takes: shareOf(inColumn.filter((row) => !ADDS.has(row.edit)), 'columnOrder', 'columnPairs'),
  };
}

/** The tries of a measure that are also of another, by its rows: what was set apart is the other's, and is not known here. */
function subset(tries, test) {
  return tries === undefined ? undefined : { tried: undefined, notReached: undefined, gone: undefined, notDrawn: undefined, boxes: undefined, rows: tries.rows.filter(test) };
}

/** The edit measures, by name, each with where its tries are on the result of a directory. */
const MEASURES = {
  containers: (result) => result.containers,
  context: (result) => result.context,
  everythingSystem: (result) => result.whole?.system,
  everythingContainer: (result) => result.whole?.container,
  everythingComponent: (result) => result.whole?.component,
  boundaries: (result) => subset(result.whole?.container, (row) => row.boundaries[0] > 1 && row.boundaries[1] > 1),
  nested: (result) => subset(result.whole?.component, (row) => row.nested[0] && row.nested[1]),
  systemComponent: (result) => result.whole?.systemComponent,
  appComponent: (result) => result.whole?.appComponent,
  components: (result) => result.components,
};

/** The shares of the pairs inside one boundary, at Container depth and at Component depth. */
function insideShares(rowsOf) {
  return { container: shareOf(rowsOf('container'), 'insideKept', 'insidePairs'), component: shareOf(rowsOf('component'), 'insideKept', 'insidePairs') };
}

/** The shares of the changes of depth of each kind: of the pairs with a box that opens taken at its boundary, and of the boxes alone. */
function depthShares(depthOf) {
  return Object.fromEntries(
    [...Object.values(CHANGES), 'system-system', 'other'].map((kind) => {
      const found = depthOf(kind);
      return [kind, found === undefined ? undefined : { notDrawn: found.notDrawn, changes: found.rows.length, opened: found.rows.reduce((sum, row) => sum + row.opened, 0), common: found.rows.reduce((sum, row) => sum + row.common, 0), kept: shareOf(found.rows, 'orderKept', 'pairs'), alone: shareOf(found.rows, 'aloneKept', 'alonePairs') }];
    }),
  );
}

/** The numbers of each directory and of every directory together: edits are pooled, so that each counts once. */
function summaryOf(results) {
  for (const result of results) {
    result.shares = {
      ...Object.fromEntries(Object.entries(MEASURES).map(([name, of]) => [name, sharesOf(of(result))])),
      others: result.others === undefined ? undefined : shareOf(result.others.rows, 'orderKept', 'pairs'),
      inside: insideShares((depth) => result.whole?.[depth]?.rows ?? []),
      depth: result.depth === undefined ? undefined : depthShares((kind) => result.depth[kind]),
    };
  }
  const sum = (pick) => results.reduce((total, each) => total + (pick(each) ?? 0), 0);
  // Counts set apart that a measure does not know stay unknown when pooled.
  const added = (values) => (values.every((value) => value === undefined) ? undefined : values.reduce((total, value) => total + (value ?? 0), 0));
  const pooled = (name) => {
    const mine = results.map((each) => [each, MEASURES[name](each)]).filter(([, tries]) => tries !== undefined);
    if (mine.length === 0) return undefined;
    const tries = Object.fromEntries(['tried', 'notReached', 'gone', 'notDrawn'].map((key) => [key, added(mine.map(([, each]) => each[key]))]));
    return { ...tries, boxes: undefined, rows: mine.flatMap(([each, found]) => found.rows.map((row) => ({ ...row, label: each.label }))) };
  };
  const shares = Object.fromEntries(Object.keys(MEASURES).map((name) => [name, sharesOf(pooled(name))]));
  const containers = pooled('containers');
  const together = (kind) => sharesOf({ ...newTries(), rows: results.map((each) => each.together?.[kind]).filter((each) => typeof each === 'object') });
  const others = results.flatMap((each) => each.others?.rows ?? []);
  const mains = results.filter((each) => each.main !== undefined);
  const inColumn = (containers?.rows ?? []).filter((row) => row.columnOrder !== undefined);
  const worstOf = (rows, adds) =>
    rows
      .filter((row) => ADDS.has(row.edit) === adds)
      .sort((a, b) => a.columnOrder - b.columnOrder)
      .slice(0, 3)
      .map((row) => ({ label: row.label, edit: row.edit, adds, common: row.common, columnPairs: row.columnPairs, columnTurned: row.columnTurned, columnOrder: row.columnOrder }));
  // The three worst edits that add, and the three worst that take out or move: both are shown.
  const worstInColumn = [...worstOf(inColumn, true), ...worstOf(inColumn, false)];
  const wholeRows = (depth) => results.flatMap((each) => each.whole?.[depth]?.rows ?? []);
  const withDepth = results.filter((each) => each.depth !== undefined);
  const stage8 = results.filter((each) => each.stage8 !== undefined);
  const same = results.filter((each) => each.same !== undefined);
  return {
    settings: sum((each) => each.settings),
    differAgain: sum((each) => each.differAgain),
    differInOrder: sum((each) => each.differInOrder),
    layouts: sum((each) => each.tally.layouts),
    failed: sum((each) => each.tally.failed),
    slowestMs: Math.max(0, ...results.map((each) => each.tally.slowestMs)),
    walk: { pairs: sum((each) => each.tally.walk.pairs), against: sum((each) => each.tally.walk.against), views: sum((each) => each.tally.walk.views) },
    geometry: { pictures: sum((each) => each.tally.geometry.pictures), withTroubles: sum((each) => each.tally.geometry.withTroubles), troubles: sum((each) => each.tally.geometry.troubles) },
    renames: { tried: sum((each) => each.renames.tried), notReached: sum((each) => each.renames.notReached), moved: sum((each) => each.renames.moved) },
    descriptions: { tried: sum((each) => each.descriptions.tried), notReached: sum((each) => each.descriptions.notReached), moved: sum((each) => each.descriptions.moved) },
    words: { tried: sum((each) => each.words.tried), notReached: sum((each) => each.words.notReached), moved: sum((each) => each.words.moved) },
    shares: { ...shares, others: shareOf(others, 'orderKept', 'pairs'), inside: insideShares(wholeRows), depth: withDepth.length === 0 ? undefined : depthShares((kind) => ({ notDrawn: withDepth.reduce((total, each) => total + each.depth[kind].notDrawn, 0), rows: withDepth.flatMap((each) => each.depth[kind].rows) })) },
    others: { edits: sum((each) => each.others?.edits), views: others.length, gone: sum((each) => each.others?.gone), added: sum((each) => each.others?.added), notDrawn: sum((each) => each.others?.notDrawn) },
    together: { containers: together('containers'), context: together('context') },
    worstInColumn,
    column: { adds: shares.containers?.adds, takes: shares.containers?.takes },
    same: same.length === 0 ? undefined : { tried: sum((each) => each.same?.tried), differ: sum((each) => each.same?.differ), notDrawn: sum((each) => each.same?.notDrawn) },
    stage8: stage8.length === 0 ? undefined : Object.fromEntries(['compared', 'missing', 'viewsDiffer', 'picturesDiffer', 'notInFile'].map((key) => [key, sum((each) => each.stage8?.[key])])),
    main: mains.length === 0 ? undefined : { crossings: sum((each) => each.main?.crossings), area: sum((each) => each.main?.area), slowestMs: Math.max(...mains.map((each) => each.main.slowestMs)) },
    crossings: Object.fromEntries(['system', 'container', 'component'].map((depth) => [depth, results.some((each) => each.sizes?.crossings[depth] !== undefined) ? sum((each) => each.sizes?.crossings[depth]) : undefined])),
    largest: results.map((each) => each.sizes?.largest).filter((each) => each !== undefined).sort((a, b) => b.boxes - a.boxes || b.arrows - a.arrows)[0],
  };
}

/** A share in per cent to one decimal, rounded down, so that a share just under a pass number does not read as equal to it. */
function pc(share) {
  return share === undefined ? '-' : `${(Math.floor(share * 1000) / 10).toFixed(1)} %`;
}

/** A share with what it rests on: `84.9 % over 83 edits and 5,120 pairs`, and what the pairs are. */
function restsOn(share, which = '', noun = 'edit') {
  return share === undefined ? 'nothing to measure' : `${pc(share.mean)} over ${count(share.edits, noun)} and ${count(share.pairs, 'pair')}${which}`;
}

/** A number of things: `1 edit`, `5,120 pairs`, `3 tries`. */
function count(n, noun) {
  return `${n.toLocaleString('en-GB')} ${n === 1 ? noun : noun.endsWith('y') ? `${noun.slice(0, -1)}ies` : `${noun}s`}`;
}

/** The worst edit that takes out or moves, which has no floor, as a pass number says it. */
function takesOf(share) {
  return `worst edit that takes out or moves ${share?.takes === undefined ? '-' : `${pc(share.takes.worst)}, of ${count(share.takes.edits, 'edit')}`}, which has no floor`;
}

/** Whether a measure passes the bars of 3 and 4: 95 % in one column, 75 % in the worst edit that adds something, and 80 % both ways. */
function barsOf3And4(share) {
  const column = share?.columnOrder;
  const adds = share?.adds;
  const both = share?.orderKept;
  if (column === undefined || adds === undefined || both === undefined) {
    const missing = both === undefined ? 'no edit with a pair' : column === undefined ? 'no edit with a pair in one column' : 'no edit that adds something with a pair in one column';
    return { tried: false, passes: false, measured: missing };
  }
  return {
    tried: true,
    passes: column.mean >= PASS.column && adds.worst >= PASS.columnWorst && both.mean >= PASS.pairs,
    measured: `${restsOn(column, ' in one column')}; worst edit that adds something ${pc(adds.worst)}, of ${count(adds.edits, 'edit')}; ${takesOf(share)}; ${restsOn(both, ' both ways')}`,
  };
}

/** Whether a measure passes a bar for the pairs that keep their order both ways. */
function bothWays(share, bar) {
  const both = share?.orderKept;
  return { tried: both !== undefined, passes: both !== undefined && both.mean >= bar, measured: both === undefined ? 'no edit with a pair' : restsOn(both) };
}

/** Each pass number asked for, what was measured, its bar, and whether it passes, fails or was not tried. */
function passesOf(results, all, plan) {
  const list = [];
  const add = (number, what, bar, { tried, passes, measured }) => {
    if (plan.numbers.has(number)) list.push({ number, what, bar, status: !tried ? 'not tried' : passes ? 'passes' : 'fails', measured });
  };
  add(1, 'The same model, laid out again and in another order: every setting', 'no picture differs, and none fails', {
    tried: plan.again && all.settings > 0,
    passes: all.differAgain === 0 && all.differInOrder === 0 && all.failed === 0,
    measured: `${all.differAgain} differ again, ${all.differInOrder} in another order, ${all.failed} of ${count(all.layouts, 'layout')} not drawn, of ${count(all.settings, 'setting')}`,
  });
  const reached = (each) => each.tried - each.notReached;
  const single = reached(all.renames) + reached(all.descriptions);
  const tries = single + reached(all.words);
  const moved = all.renames.moved + all.descriptions.moved + all.words.moved;
  add(2, 'A new name or a new description: every setting', 'nothing moves in any try', {
    tried: tries > 0,
    passes: moved === 0,
    measured: `${moved} of ${count(tries, 'try')} move something: ${count(single, 'try')} one at a time on the two pictures of stage 5 of the largest system, and ${count(reached(all.words), 'try')} of every name or every description at once, on every setting; ${count(all.renames.notReached + all.descriptions.notReached + all.words.notReached, 'try')} not reached`,
  });
  const column = all.shares.containers?.columnOrder;
  const adds = all.column.adds;
  add(3, 'One edit, one system at Container depth: pairs in one column that keep their order', '95 % over all edits; 75 % in the worst edit that adds something', {
    tried: column !== undefined && adds !== undefined,
    passes: column !== undefined && adds !== undefined && column.mean >= PASS.column && adds.worst >= PASS.columnWorst,
    measured: column === undefined || adds === undefined ? 'no edit that adds something with a pair in one column' : `${restsOn(column, ' in one column')}; worst edit that adds something ${pc(adds.worst)}, of ${count(adds.edits, 'edit')}; ${takesOf(all.shares.containers)}`,
  });
  const pairs = all.shares.containers?.orderKept;
  const each = results.filter((result) => result.shares?.containers?.orderKept !== undefined);
  const least = Math.min(...each.map((result) => result.shares.containers.orderKept.mean));
  add(4, 'One edit, one system at Container depth: pairs that keep their order both ways', '80 % over all models; 65 % in each model', {
    tried: pairs !== undefined,
    passes: pairs !== undefined && pairs.mean >= PASS.pairs && least >= PASS.pairsEachModel,
    measured: pairs === undefined ? 'no edit with a pair' : `${restsOn(pairs)}; least in a model ${pc(least)}, of ${count(each.length, 'model')} with an edit`,
  });
  add(5, 'One edit, one system at System depth: pairs that keep their order both ways', '80 % over all models', bothWays(all.shares.context, PASS.context));
  add(6, 'The slowest layout of any setting', '2 seconds', { tried: all.layouts > 0, passes: all.slowestMs <= PASS.slowest, measured: `${(all.slowestMs / 1000).toFixed(2)} s, of ${count(all.layouts, 'layout')}` });
  // Number 7, a view of more than 40 boxes reported by the check, went with the check at stage 9.
  add(8, 'One edit, everything at System depth: pairs that keep their order both ways', '80 %', bothWays(all.shares.everythingSystem, PASS.bothWays));
  const bars = 'the bars of 3 and 4: 95 % in one column, 75 % in the worst edit that adds something, 80 % both ways';
  add(9, 'One edit, everything at Container depth', bars, barsOf3And4(all.shares.everythingContainer));
  add(10, 'One edit, everything at Component depth', bars, barsOf3And4(all.shares.everythingComponent));
  add(11, 'Of 9, the pictures with more than one boundary before and after the edit, alone', bars, barsOf3And4(all.shares.boundaries));
  add(12, 'Of 10, the pictures with a boundary inside a boundary before and after the edit, alone', bars, barsOf3And4(all.shares.nested));
  add(13, 'One edit, the largest system at Component depth: pairs that keep their order both ways', '80 %', bothWays(all.shares.systemComponent, PASS.bothWays));
  add(14, 'One edit, the app with the most components, chosen, at Component depth: pairs that keep their order both ways', '80 %', bothWays(all.shares.appComponent, PASS.bothWays));
  add(15, 'A component added, taken out or moved: everything, its system and its app, at Component depth', bars, barsOf3And4(all.shares.components));
  const inside = all.shares.inside;
  add(16, 'One edit, everything: pairs of boxes inside one boundary before and after that keep their order both ways', '80 % at Container depth and at Component depth', {
    tried: inside.container !== undefined && inside.component !== undefined,
    passes: inside.container !== undefined && inside.component !== undefined && inside.container.mean >= PASS.inside && inside.component.mean >= PASS.inside,
    measured: `at Container depth ${restsOn(inside.container)}; at Component depth ${restsOn(inside.component)}`,
  });
  for (const [number, what] of [
    [17, 'A change of depth, everything, System to Container: pairs in both pictures that keep their order both ways'],
    [18, 'A change of depth, everything, Container to Component: the same'],
    [19, 'A change of depth, one system, Container to Component: the same'],
    [20, 'A change of depth, the chosen app, Container to Component: the same'],
  ]) {
    const share = all.shares.depth?.[CHANGES[number]]?.kept;
    const [mean, worst] = PASS.depth[number];
    add(number, what, `${mean * 100} % over all; ${worst * 100} % in the worst`, {
      tried: share !== undefined,
      passes: share !== undefined && share.mean >= mean && share.worst >= worst,
      measured: share === undefined ? 'no change that opens something, with a pair' : `${restsOn(share, '', 'change')}; worst ${pc(share.worst)}`,
    });
  }
  const stage8 = all.stage8;
  const same = all.same;
  const stage8Differ = stage8 === undefined ? 0 : stage8.missing + stage8.viewsDiffer + stage8.picturesDiffer + stage8.notInFile;
  const firstHalf = stage8 === undefined ? 'the first half not tried: no --before' : `${stage8Differ} of ${count(stage8.compared + stage8.notInFile, 'picture')} of stage 5 differ from what the code of stage 8 made (${stage8.viewsDiffer} in the view, ${stage8.picturesDiffer} in the picture, ${stage8.missing} not made now, ${stage8.notInFile} not in the file)`;
  const secondHalf = same === undefined || same.tried === 0 ? 'no change of depth that opens nothing' : `${same.differ} of ${count(same.tried, 'change')} of depth that open nothing differ${same.notDrawn > 0 ? `, ${same.notDrawn} not drawn` : ''}`;
  add(22, 'The two pictures of stage 5, against the code of stage 8; and a change of depth that opens nothing', 'no picture differs', {
    tried: stage8 !== undefined && stage8.compared > 0 && same !== undefined && same.tried > 0,
    passes: stage8Differ === 0 && same !== undefined && same.differ === 0 && same.notDrawn === 0,
    measured: `${firstHalf}; ${secondHalf}`,
  });
  add(23, 'Every setting: pairs of boxes in one column of one boundary, or of none, that stand against their turns', 'none', {
    tried: plan.every && all.walk.pairs > 0,
    passes: all.walk.against === 0,
    measured: `${all.walk.against} of ${count(all.walk.pairs, 'pair')}, in ${count(all.layouts, 'layout')} with every setting among them; ${count(all.walk.views, 'layout')} with one`,
  });
  return list;
}

/** A share in whole per cent, rounded down, or `-`. */
function per(share) {
  return share === undefined ? '-' : String(Math.floor(share * 100));
}

/** A count, or `-` when it is not known. */
function known(value) {
  return value === undefined ? '-' : value;
}

/** The tables of the edit measures: one row for each directory and one for all, as the tables of stage 7 had them. */
function editTable(title, rows, name) {
  const header = ['', 'Boxes', 'Edits', 'Not reached', 'Gone', 'Not drawn', 'No pair', 'Moved', 'Order kept', 'Of edits', 'Of pairs', 'In a column', 'Of edits', 'Of pairs', 'Worst kept', 'Worst in a column', 'Worst adding, in a column'];
  return [
    title,
    ...table(
      header,
      rows.map((row) => {
        const s = row.shares?.[name];
        if (s === undefined) return [row.name, '-', 0, ...Array(header.length - 3).fill('-')];
        return [row.name, known(s.boxes), known(s.tried), known(s.notReached), known(s.gone), known(s.notDrawn), s.noPair, per(s.moved?.mean), per(s.orderKept?.mean), s.orderKept?.edits ?? 0, s.orderKept?.pairs ?? 0, per(s.columnOrder?.mean), s.columnOrder?.edits ?? 0, s.columnOrder?.pairs ?? 0, per(s.orderKept?.worst), per(s.columnOrder?.worst), per(s.adds?.worst)];
      }),
    ),
    '',
  ];
}

/** The tables, for a person: those of the pass numbers asked for. */
function printed(results, all, passes, plan) {
  const rows = [...results.map((each) => ({ ...each, name: each.label })), { ...all, name: 'All', tally: all, notes: [] }];
  const asked = (...numbers) => numbers.some((number) => plan.numbers.has(number));
  const lines = [];
  lines.push(
    `The layout tried on ${results.length} source ${results.length === 1 ? 'directory' : 'directories'}, for pass ${plan.numbers.size === 1 ? 'number' : 'numbers'} ${[...plan.numbers].join(', ')}. Shares are in per cent, rounded down. A box has moved when its centre is more than half a box (${BOX_WIDTH / 2} by ${BOX_HEIGHT / 2} px) from where it stood, after the shift all boxes share. A share is the mean of each edit's own; an edit that does not reach a picture, or leaves no pair, is in none.`,
    '',
  );

  if (asked(1)) {
    lines.push(
      'Every setting, laid out again and in another order',
      ...table(
        ['', 'Settings', 'Differ again', 'In another order', 'Layouts not drawn'],
        rows.map((row) => [row.name, row.settings, row.differAgain, row.differInOrder, row.tally.failed]),
      ),
      '',
    );
  }
  if (asked(2)) {
    lines.push(
      'New words: one at a time on the two pictures of stage 5 of the largest system, and every name or every description at once on every setting',
      ...table(
        ['', 'Renames', 'Not reached', 'Moved', 'Descriptions', 'Not reached', 'Moved', 'All at once', 'Not reached', 'Moved'],
        rows.map((row) => [row.name, row.renames.tried, row.renames.notReached, row.renames.moved, row.descriptions.tried, row.descriptions.notReached, row.descriptions.moved, row.words.tried, row.words.notReached, row.words.moved]),
      ),
      '',
    );
  }
  if (asked(3, 4, 5)) {
    lines.push(...editTable('One edit, the largest system at Container depth: its container view of stage 5', rows, 'containers'));
    lines.push(...editTable('One edit, the same system at System depth: its context view', rows, 'context'));
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
      'Five edits made together, each on the model the one before left: moved, order kept, in a column, with the pairs of each: no pass number',
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
      'Other pictures of stage 5 of the model, after one edit that changes them: no pass number',
      ...table(
        ['', 'Edits', 'Pictures', 'Pairs', 'Order kept', 'Worst kept', 'Gone', 'New', 'Not drawn'],
        rows.map((row) => {
          const others = row === rows.at(-1) ? all.others : row.others;
          const share = row.shares?.others;
          if (others === undefined) return [row.name, ...Array(8).fill('-')];
          return [row.name, others.edits, row === rows.at(-1) ? others.views : others.rows.length, share?.pairs ?? 0, per(share?.mean), per(share?.worst), others.gone, others.added, others.notDrawn];
        }),
      ),
      '',
    );
  }
  const measures = [
    [8, 'everythingSystem', 'One edit, everything at System depth, for pass number 8'],
    [9, 'everythingContainer', 'One edit, everything at Container depth, for pass number 9'],
    [10, 'everythingComponent', 'One edit, everything at Component depth, for pass number 10'],
    [11, 'boundaries', 'Of those at Container depth, the pictures with more than one boundary before and after the edit, for pass number 11'],
    [12, 'nested', 'Of those at Component depth, the pictures with a boundary inside a boundary before and after the edit, for pass number 12'],
    [13, 'systemComponent', 'One edit, the largest system at Component depth, for pass number 13'],
    [14, 'appComponent', 'One edit, the app with the most components, chosen, at Component depth, for pass number 14'],
    [15, 'components', 'A component added, taken out or moved: everything, its system and its app, at Component depth, for pass number 15'],
  ];
  for (const [number, name, title] of measures) if (asked(number)) lines.push(...editTable(title, rows, name));
  if (asked(16)) {
    lines.push(
      'One edit, everything: pairs of boxes inside the same boundary before and after, that keep their order both ways, for pass number 16',
      ...table(
        ['', 'Container: edits', 'Pairs', 'Kept', 'Worst', 'Component: edits', 'Pairs', 'Kept', 'Worst'],
        rows.map((row) => {
          const cells = (share) => [share?.edits ?? 0, share?.pairs ?? 0, per(share?.mean), per(share?.worst)];
          return [row.name, ...cells(row.shares?.inside?.container), ...cells(row.shares?.inside?.component)];
        }),
      ),
      '',
    );
  }
  const changes = [
    [17, 'everything-system', 'A change of depth, everything, System to Container, for pass number 17'],
    [18, 'everything-container', 'A change of depth, everything, Container to Component, for pass number 18'],
    [19, 'system-container', 'A change of depth, one system, Container to Component, for pass number 19'],
    [20, 'app-container', 'A change of depth, the chosen app, Container to Component, for pass number 20'],
    [undefined, 'system-system', 'A change of depth, one system, System to Container: from its context view to its container view, which keep their pictures of stage 5, no pass number'],
  ];
  for (const [number, kind, title] of changes) {
    if (number === undefined ? !asked(17, 18, 19, 20) : !asked(number)) continue;
    lines.push(
      `${title}. Pairs of boxes in both pictures that keep their order both ways, a box that opens taken at its boundary; and of the boxes alone, as Astra's trial took them`,
      ...table(
        ['', 'Changes', 'Boxes opened', 'Boxes in both', 'Pairs', 'Kept', 'Worst kept', 'Not drawn', 'Boxes alone: pairs', 'Kept', 'Worst kept'],
        rows.map((row) => {
          const s = row.shares?.depth?.[kind];
          if (s === undefined) return [row.name, ...Array(10).fill('-')];
          return [row.name, s.changes, s.opened, s.common, s.kept?.pairs ?? 0, per(s.kept?.mean), per(s.kept?.worst), s.notDrawn, s.alone?.pairs ?? 0, per(s.alone?.mean), per(s.alone?.worst)];
        }),
      ),
      '',
    );
  }
  if (asked(22)) {
    lines.push(
      'The two pictures of stage 5 against what the code of stage 8 made of them, and every change of depth that opens nothing, for pass number 22',
      ...table(
        ['', 'Pictures of stage 5', 'Views differ', 'Pictures differ', 'Not made now', 'Not in the file', 'Changes that open nothing', 'Differ', 'Not drawn'],
        rows.map((row) => [row.name, known(row.stage8?.compared), known(row.stage8?.viewsDiffer), known(row.stage8?.picturesDiffer), known(row.stage8?.missing), known(row.stage8?.notInFile), known(row.same?.tried), known(row.same?.differ), known(row.same?.notDrawn)]),
      ),
      '',
    );
  }
  lines.push(
    'The pictures as they are, and every layout made',
    ...table(
      ['', 'Largest: boxes', 'Arrows', 'Boundaries', 'Crossings, everything: System', 'Container', 'Component', 'Main views: crossings', 'Area, million px²', 'Slowest main, s', 'Layouts', 'Slowest of all, s'],
      rows.map((row) => {
        const sizes = row === rows.at(-1) ? { largest: all.largest, crossings: all.crossings } : row.sizes;
        return [
          row.name,
          known(sizes?.largest?.boxes),
          known(sizes?.largest?.arrows),
          known(sizes?.largest?.boundaries),
          known(sizes?.crossings.system),
          known(sizes?.crossings.container),
          known(sizes?.crossings.component),
          row.main?.crossings ?? '-',
          row.main === undefined ? '-' : (row.main.area / 1e6).toFixed(1),
          row.main === undefined ? '-' : (row.main.slowestMs / 1000).toFixed(2),
          row.tally.layouts,
          (row.tally.slowestMs / 1000).toFixed(2),
        ];
      }),
    ),
    '',
    'Every layout against its turns, for pass number 23, and the geometry of every picture: a box, a line or a label over another, or a box outside its boundary',
    ...table(
      ['', 'Pairs in a column', 'Against the turns', 'Layouts with one', 'Pictures checked', 'With a fault', 'Faults'],
      rows.map((row) => [row.name, row.tally.walk.pairs, row.tally.walk.against, row.tally.walk.views, row.tally.geometry.pictures, row.tally.geometry.withTroubles, row.tally.geometry.troubles]),
    ),
    '',
  );

  const notes = results.flatMap((each) => each.notes.map((note) => `${each.label}: ${note}.`));
  if (notes.length > 0) lines.push(...notes, '');
  lines.push('The pass numbers', ...table(['#', 'Status', 'What is measured', 'It passes at', 'Measured'], passes.map((each) => [each.number, each.status, each.what, each.bar, each.measured]), [true, true, true, true, true]));
  return lines.join('\n');
}

/**
 * Rows of cells as lines, each column as wide as its widest cell: the first to the left, the
 * others to the right, unless `left` says of a column that it stands to the left.
 */
function table(header, rows, left = []) {
  const cells = [header, ...rows].map((row) => row.map(String));
  const widths = header.map((_, at) => Math.max(...cells.map((row) => (row[at] ?? '').length)));
  return cells.map((row) => row.map((cell, at) => (at === 0 || left[at] === true ? cell.padEnd(widths[at]) : cell.padStart(widths[at]))).join('  ').trimEnd());
}

await main();
