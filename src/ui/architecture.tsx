import { useMemo } from 'react';
import { useOutletContext, useSearchParams } from 'react-router-dom';
import { depthOf, viewOf } from '../model/view.ts';
import { Diagram } from './diagram.tsx';
import type { ModelState } from './shell.tsx';
import { CanvasFrame, EmptyState } from './ui.tsx';

/** The landing page: the whole model as a diagram, at the depth the address names. */
export function Architecture() {
  const { answer, failed } = useOutletContext<ModelState>();
  const [params] = useSearchParams();
  const depth = depthOf(params.get('depth'));
  const view = useMemo(() => (answer ? viewOf(answer.records, depth) : undefined), [answer, depth]);
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
  return <Diagram key={depth} view={view} />;
}
