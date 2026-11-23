import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { ModelAnswer } from '../model/answer.ts';
import './page.css';

/** The page: the folder's name, how many files were read, and their names. */
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
  const count = answer.files.length;
  return (
    <main>
      <h1>{answer.folder}</h1>
      <p>{count === 0 ? 'No files.' : `${count} ${count === 1 ? 'file' : 'files'} read.`}</p>
      {count > 0 && (
        <ul>
          {answer.files.map((file) => <li key={file}>{file}</li>)}
        </ul>
      )}
    </main>
  );
}

const root = document.getElementById('root');
if (root !== null) createRoot(root).render(<Page />);
