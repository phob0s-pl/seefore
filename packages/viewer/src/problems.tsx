import type { Problem } from '@seefore/core';
import { problemWords } from './listing.tsx';

/** What the check found, in its order, each with its file, line and column. */

/** A message with what it quotes in backticks set as code. The words stay text. */
export function Message({ text }: { text: string }) {
  const parts = text.split('`');
  // A backtick with no partner is kept as it is written.
  if (parts.length % 2 === 0) return <>{text}</>;
  return <>{parts.map((part, at) => (at % 2 === 1 ? <code key={at}>{part}</code> : part))}</>;
}

/** One problem. */
function ProblemItem({ problem }: { problem: Problem }) {
  return (
    <li className={`problem ${problem.severity}`}>
      <span className="severity">{problem.severity === 'error' ? 'Error' : 'Warning'}</span>{' '}
      <code className="place">{`${problem.file}:${problem.line}:${problem.column}`}</code>{' '}
      <span className="message">
        <Message text={problem.message} />
      </span>{' '}
      <span className="code">{`(${problem.code})`}</span>
    </li>
  );
}

/** The list of problems, as it stands under a heading of its own or in place of the views. */
export function ProblemList({ problems }: { problems: readonly Problem[] }) {
  return (
    <ol className="problems">
      {problems.map((problem, at) => (
        <ProblemItem key={at} problem={problem} />
      ))}
    </ol>
  );
}

/** The page of problems. */
export function Problems({ problems }: { problems: readonly Problem[] }) {
  const errors = problems.filter((problem) => problem.severity === 'error').length;
  const warnings = problems.length - errors;
  return (
    <article className="problems-page">
      <h1>Problems</h1>
      {problems.length === 0 ? (
        <p>The check found no problems.</p>
      ) : (
        <>
          <p>{`The check found ${problemWords(errors, warnings)}. A record whose own file has an error is not drawn, and the rest still is.`}</p>
          <ProblemList problems={problems} />
        </>
      )}
    </article>
  );
}
