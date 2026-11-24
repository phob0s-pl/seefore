import { useCallback, useMemo, useState } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { depthOf, viewOf } from '../model/view.ts';
import type { Depth } from '../model/view.ts';
import { Diagram } from './diagram.tsx';
import { Inspector } from './inspector.tsx';
import type { ModelState } from './shell.tsx';
import { CanvasFrame, EmptyState, useTitle } from './ui.tsx';

/** The landing page: the whole model as a diagram, at the depth the address names, and the panel of what is picked on it. */
export function Architecture() {
  useTitle('Architecture');
  const { answer, catalogue, failed } = useOutletContext<ModelState>();
  const [params] = useSearchParams();
  const depth = depthOf(params.get('depth'));
  const view = useMemo(() => (answer ? viewOf(answer.records, depth) : undefined), [answer, depth]);
  // The id of the picked box or line, at the depth it was picked at: a change of depth clears it.
  const [pick, setPick] = useState<{ id: string; depth: Depth }>();
  if (pick !== undefined && pick.depth !== depth) setPick(undefined);
  const picked = pick?.depth === depth ? pick.id : undefined;
  const onPick = useCallback((id?: string) => setPick(id === undefined ? undefined : { id, depth }), [depth]);
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
  // A new depth is a new diagram, laid out and fitted afresh.
  return (
    <Diagram key={depth} view={view} depth={depth} picked={picked} onPick={onPick}>
      {picked !== undefined && catalogue !== undefined && <Inspector picked={picked} view={view} catalogue={catalogue} onClose={clear} />}
    </Diagram>
  );
}
