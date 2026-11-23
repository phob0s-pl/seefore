import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ModelAnswer } from '../model/answer.ts';
import { KINDS } from '../model/kinds.ts';
import './page.css';

/** The page: the model's name, a count for each kind, and the problems. */
function Page() {
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

  if (failed !== undefined) return <main><p className="failed">{failed}</p></main>;
  if (answer === undefined) return <main><p>Reading…</p></main>;
  const total = answer.records.length;
  const counts = KINDS.flatMap(({ folder, one, many }) => {
    const n = answer.records.filter((record) => record.kind === folder).length;
    return n > 0 ? [`${n} ${n === 1 ? one : many}`] : [];
  });
  return (
    <main>
      <h1>{answer.name ?? answer.folder}</h1>
      <p>{total === 0 ? 'No records.' : `${total} ${total === 1 ? 'record' : 'records'}: ${counts.join(', ')}`}</p>
      {answer.problems.length === 0 ? (
        <p>No problems.</p>
      ) : (
        <ul className="problems">
          {answer.problems.map((problem, index) => (
            <li key={index}>
              <p className="where">
                {problem.severity === 'warning' && <strong>Warning </strong>}
                {problem.file}, line {problem.line}
              </p>
              <p>{problem.message}</p>
              <p>Mend: {problem.fix}</p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<Page />);
