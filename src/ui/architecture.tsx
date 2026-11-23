import { useEffect, useState } from 'react';
import type { ModelAnswer } from '../model/answer.ts';
import { EmptyState, LargeTitle } from './ui.tsx';

/** The landing page: the model's name, and the empty place where its diagram will be. */
export function Architecture() {
  const [answer, setAnswer] = useState<ModelAnswer>();
  const [failed, setFailed] = useState<string>();

  useEffect(() => {
    fetch('/api/model')
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.text()).trim());
        setAnswer((await response.json()) as ModelAnswer);
      })
      .catch((cause: unknown) => {
        setFailed(cause instanceof Error && cause.message !== '' ? cause.message : 'Cannot reach seefore.');
      });
  }, []);

  if (failed !== undefined) return <p className="page-line failed">{failed}</p>;
  if (answer === undefined) return <p className="page-line">Reading…</p>;
  return (
    <>
      <LargeTitle>{answer.name ?? answer.folder}</LargeTitle>
      <EmptyState title="No diagram yet">The diagram comes next.</EmptyState>
    </>
  );
}
