import { conditionsOf, connectionsInNoView, load, outlineOf, ownership, viewsOf } from '@seefore/core';
import type { Condition, Drawn, PlacedArrow, PlacedBox, View, ViewerState } from '@seefore/core';

/**
 * The archive of stage 6b, worked out by the engine as the server works it out, with a picture
 * placed by hand. Desk keeps its drafts and a cache, which its editor reads; the indexer, there
 * only in the hosted edition, reads the drafts all the same, and staff open one by hand. A gate
 * is part of the archive and staff reload it; an office proxy is part of it too, there only in
 * the head office, and nothing starts or ends at it. Desk tells the staff browser when a job is
 * done, down a channel the browser opened, through an HTTPS proxy in no system and the office
 * proxy. Desk saves to the records, and the indexer reads them at night.
 */
export const ARCHIVE_FILES: Readonly<Record<string, string>> = {
  'seefore.yaml': 'format: 1\nname: Archive\n',
  'people/staff.yaml': 'name: Staff\n',
  'systems/archive.yaml': 'name: Archive\n',
  'apps/desk.yaml': 'name: Desk\nin: archive\nkind: service\n',
  'apps/browser.yaml': 'name: Staff browser\nin: archive\nkind: browser\n',
  'apps/indexer.yaml': 'name: Indexer\nin: archive\nonly: in the hosted edition\n',
  'components/editor.yaml': 'name: Editor\nin: desk\n',
  'stores/drafts.yaml': 'name: Drafts\nin: desk\ndescription: Edits that are not yet saved, in a file beside Desk.\nkind: files\n',
  'stores/cache.yaml': 'name: Cache\nin: desk\nonly: when caching is on\nkind: cache\n',
  'stores/records.yaml': 'name: Records\nin: archive\nkind: database\n',
  'infrastructure/proxy.yaml': 'name: HTTPS proxy\n',
  'infrastructure/office-proxy.yaml': 'name: Office proxy\nin: archive\nonly: in the head office\n',
  'infrastructure/gate.yaml': 'name: Gate\nin: archive\n',
  'connections/desk-keeps-drafts.yaml': 'from: desk\nto: drafts\naccess: read-write\nname: Keeps edits that are not yet saved\n',
  'connections/editor-reads-cache.yaml': 'from: editor\nto: cache\naccess: read\nname: Reads what it cached\n',
  'connections/indexer-reads-drafts.yaml': 'from: indexer\nto: drafts\naccess: read\nname: Reads the drafts\n',
  'connections/staff-opens-drafts.yaml': 'from: staff\nto: drafts\nname: Opens a draft by hand\n',
  'connections/desk-tells-browser.yaml': 'from: desk\nto: browser\nvia: [proxy, office-proxy]\nopens: to\nname: Says when a job is done\n',
  'connections/desk-saves-records.yaml': 'from: desk\nto: records\naccess: write\nname: Saves an edit\n',
  'connections/indexer-reads-records.yaml': 'from: indexer\nto: records\naccess: read\nname: Reads the records\nonly: at night\n',
  'connections/staff-reloads-gate.yaml': 'from: staff\nto: gate\nname: Reloads it\n',
};

/** The reading of a source directory of these files, as the server hands it to the page. */
export function stateOf(files: Readonly<Record<string, string>>): ViewerState {
  const loaded = load(Object.entries(files).map(([path, text]) => ({ path, text })));
  const { model } = loaded;
  const views = viewsOf(model);
  const records = [model.people, model.systems, model.apps, model.stores, model.components, model.infrastructure, model.connections].flat();
  return {
    revision: 'a1',
    directory: '/work/archive/architecture',
    available: true,
    name: 'Archive',
    format: 1,
    records: loaded.records.length,
    errors: loaded.problems.filter((problem) => problem.severity === 'error').length,
    warnings: loaded.problems.filter((problem) => problem.severity === 'warning').length,
    problems: loaded.problems,
    model,
    ownership: Object.fromEntries(ownership(model)),
    conditions: Object.fromEntries(records.map((record): [string, Condition[]] => [record.id, conditionsOf(model, record.id)]).filter(([, found]) => found.length > 0)),
    outline: outlineOf(model),
    views,
    inNoView: connectionsInNoView(model, views),
  };
}

/** The reading of the archive. */
export const ARCHIVE_STATE: ViewerState = stateOf(ARCHIVE_FILES);

/** The view with this id of a reading, the archive's unless another is given. */
export function archiveView(id: string, state: ViewerState = ARCHIVE_STATE): View {
  const found = state.views.find((view) => view.id === id);
  if (found === undefined) throw new Error(`The reading has no view ${id}.`);
  return found;
}

/**
 * A picture of a view of the archive placed by hand: the boxes inside the boundary in a row
 * across its top, those outside in a row beneath it, each arrow a straight line from the middle
 * of the right of one box to the middle of the left of the other, with its label half way. The
 * text of each box is its name and kind line whole, its `only` line, and no sentence.
 */
export function archivePicture(view: View): Drawn {
  const places = new Map<string, { x: number; y: number }>();
  const insideBoxes = view.boxes.filter((box) => box.inside);
  const outside = view.boxes.filter((box) => !box.inside);
  insideBoxes.forEach((box, at) => places.set(box.id, { x: 64 + at * 320, y: 104 }));
  outside.forEach((box, at) => places.set(box.id, { x: 40 + at * 320, y: 440 }));
  const boxes: PlacedBox[] = view.boxes.map((box) => {
    const place = places.get(box.id) ?? { x: 0, y: 0 };
    return {
      id: box.id,
      ...place,
      width: 240,
      height: 150,
      name: [box.name],
      line: box.line,
      ...(box.only === undefined ? {} : { only: `only ${box.only}` }),
      sentence: [],
      inset: { left: 12, right: 12 },
    };
  });
  const width = 40 + Math.max(insideBoxes.length * 320 + 24, outside.length * 320) + 40;
  const boundary = view.boundary;
  const arrows: PlacedArrow[] = view.arrows.map((arrow) => {
    const [from, to] = [places.get(arrow.from) ?? { x: 40, y: 80 }, places.get(arrow.to) ?? { x: 40, y: 80 }];
    const start = { x: from.x + 240, y: from.y + 75 };
    const end = { x: to.x, y: to.y + 75 };
    const lines = arrow.names;
    const label = {
      x: (start.x + end.x) / 2 - 60,
      y: (start.y + end.y) / 2 - 20,
      width: 120,
      height: 40,
      lines,
      ...(arrow.route === undefined ? {} : { route: arrow.route.line }),
      ...(arrow.only === undefined ? {} : { only: arrow.only.line }),
      ...(arrow.opened?.line === undefined ? {} : { opened: arrow.opened.line }),
      ...(arrow.technology.length === 0 ? {} : { technology: `[${arrow.technology.join(', ')}]` }),
    };
    return { id: arrow.id, from: arrow.from, to: arrow.to, sections: [[start, end]], label };
  });
  return {
    view: view.id,
    width,
    height: 640,
    boxes,
    ...(boundary === undefined
      ? {}
      : {
          boundary: { id: boundary.id, x: 40, y: 40, width: insideBoxes.length * 320 + 24, height: 260, title: boundary.title, titleAt: { x: 64, y: 52, width: 140, height: 20 } },
        }),
    arrows,
  };
}
