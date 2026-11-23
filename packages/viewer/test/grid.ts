import type { Drawn, View, ViewerState } from '@seefore/core';
import { stateOf } from './archive.ts';

/**
 * A system of so many apps, each joined to the next by a connection, worked out by the engine:
 * its container view has that many boxes. Its picture is placed by hand, eight boxes to a row
 * inside the boundary, each arrow a straight line from one box to the next.
 */
export function grid(apps: number): { state: ViewerState; view: View; drawn: Drawn } {
  const id = (at: number) => `part-${String(at).padStart(3, '0')}`;
  const files: Record<string, string> = { 'seefore.yaml': 'format: 1\nname: Grid\n', 'systems/grid.yaml': 'name: Grid\n' };
  for (let at = 0; at < apps; at++) {
    files[`apps/${id(at)}.yaml`] = `name: Part ${at}\nin: grid\nkind: service\n`;
    if (at > 0) files[`connections/${id(at - 1)}-calls-${id(at)}.yaml`] = `from: ${id(at - 1)}\nto: ${id(at)}\nname: Calls the next\n`;
  }
  const state = stateOf(files);
  const view = state.views.find((each) => each.id === 'container~grid');
  if (view === undefined) throw new Error('The grid has no container view.');
  const place = (box: string) => {
    const at = Number(box.slice('part-'.length));
    return { x: 64 + (at % 8) * 320, y: 104 + Math.floor(at / 8) * 240 };
  };
  const rows = Math.ceil(apps / 8);
  const width = 64 + 8 * 320 + 40;
  const height = 104 + rows * 240 + 40;
  const drawn: Drawn = {
    view: view.id,
    width,
    height,
    boundaries: [{ id: 'grid', x: 40, y: 40, width: width - 80, height: height - 80, title: 'Grid [System]', titleAt: { x: 64, y: 52, width: 120, height: 20 } }],
    boxes: view.boxes.map((box) => ({ id: box.id, ...place(box.id), width: 240, height: 150, name: [box.name], line: box.line, sentence: [], inset: { left: 12, right: 12 } })),
    arrows: view.arrows.map((arrow) => {
      const [from, to] = [place(arrow.from), place(arrow.to)];
      return { id: arrow.id, from: arrow.from, to: arrow.to, sections: [[{ x: from.x + 240, y: from.y + 75 }, { x: to.x, y: to.y + 75 }]] };
    }),
  };
  return { state, view, drawn };
}
