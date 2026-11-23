import { useOutletContext } from 'react-router-dom';
import type { ModelState } from './shell.tsx';
import { EmptyState, LargeTitle } from './ui.tsx';

/** The landing page: the empty place where the diagram of the model will be. */
export function Architecture() {
  const { answer, failed } = useOutletContext<ModelState>();
  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (answer === undefined) return <p className="page-line">Reading…</p>;
  return (
    <>
      <LargeTitle>Architecture</LargeTitle>
      <EmptyState title="No diagram yet">The diagram comes next.</EmptyState>
    </>
  );
}
