import { useCallback, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { depthOf, focusFor, viewOf } from '../model/view.ts';
import { Diagram } from './diagram.tsx';
import { Inspector } from './inspector.tsx';
import type { ModelState } from './shell.tsx';
import { CanvasFrame, EmptyState, useTitle } from './ui.tsx';

/**
 * The landing page: the model as a diagram, at the depth and with the focus the address names,
 * and the panel of what is picked on it.
 */
export function Architecture() {
  useTitle('Architecture');
  const { answer, catalogue, failed } = useOutletContext<ModelState>();
  const [params] = useSearchParams();
  const depth = depthOf(params.get('depth'));
  // A focus the model does not have at this depth is none: everything is drawn.
  const wanted = params.get('focus');
  const focus = useMemo(() => (answer ? focusFor(answer.records, depth, wanted) : undefined), [answer, depth, wanted]);
  const view = useMemo(() => (answer ? viewOf(answer.records, depth, focus) : undefined), [answer, depth, focus]);
  // Each depth and focus is a diagram of its own.
  const scene = `${depth} ${focus ?? ''}`;
  // The id of the picked box or line, in the diagram it was picked in: another diagram clears it.
  const [pick, setPick] = useState<{ id: string; scene: string }>();
  if (pick !== undefined && pick.scene !== scene) setPick(undefined);
  const picked = pick?.scene === scene ? pick.id : undefined;
  const onPick = useCallback((id?: string) => setPick(id === undefined ? undefined : { id, scene }), [scene]);
  const clear = useCallback(() => setPick(undefined), []);

  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (view === undefined) return <p className="page-line">Reading…</p>;
  if (view.boxes.length === 0) {
    return (
      <CanvasFrame label="Architecture diagram">
        <div className="canvas-empty">
          <EmptyState bare title="Nothing to draw yet" />
        </div>
      </CanvasFrame>
    );
  }
  // A new depth or focus is a new diagram, laid out and fitted afresh.
  return (
    <Diagram key={scene} view={view} depth={depth} picked={picked} onPick={onPick}>
      {picked !== undefined && catalogue !== undefined && <Inspector picked={picked} view={view} catalogue={catalogue} onClose={clear} />}
    </Diagram>
  );
}
