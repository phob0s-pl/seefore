import { C4_CODES, c4Line } from '@seefore/core';
import type { C4Check, C4Code, C4Report, Problem } from '@seefore/core';
import { count, problemWords } from './listing.tsx';

/**
 * What the check found, in its order, each with its file, line and column; then what the C4
 * checks counted, a line for each, as `seefore check` prints them.
 */

/** A message with what it quotes in backticks set as code. The words stay text. */
export function Message({ text }: { text: string }) {
  const parts = text.split('`');
  // A backtick with no partner is kept as it is written.
  if (parts.length % 2 === 0) return <>{text}</>;
  return <>{parts.map((part, at) => (at % 2 === 1 ? <code key={at}>{part}</code> : part))}</>;
}

/** The word each kind of finding is shown with. */
const KIND_WORDS = { error: 'Error', warning: 'Warning', note: 'Note' } as const;

/** Something found at a place in a file: a problem, or what one of the C4 checks found. */
interface Found {
  file: string;
  line: number;
  column: number;
  severity: keyof typeof KIND_WORDS;
  code: string;
  message: string;
}

/** One thing found: its kind, its place, its words and its code. */
function FoundItem({ found }: { found: Found }) {
  return (
    <li className={`problem ${found.severity}`}>
      <span className="severity">{KIND_WORDS[found.severity]}</span>{' '}
      <code className="place">{`${found.file}:${found.line}:${found.column}`}</code>{' '}
      <span className="message">
        <Message text={found.message} />
      </span>{' '}
      <span className="code">{`(${found.code})`}</span>
    </li>
  );
}

/** The list of problems, as it stands under a heading of its own or in place of the views. */
export function ProblemList({ problems }: { problems: readonly Problem[] }) {
  return (
    <ol className="problems">
      {problems.map((problem, at) => (
        <FoundItem key={at} found={problem} />
      ))}
    </ol>
  );
}

/**
 * What the C4 checks counted, a line for each in the order of the set. A line that found
 * something opens to what it found, and is closed until the reader opens it, so that a long
 * list stands below the problems and pushes none of them away. A summary of a disclosure opens
 * with the keyboard as with the pointer, and tells a screen reader whether it is open; its line
 * says how many it holds.
 */
function C4Checks({ report }: { report: C4Report }) {
  return (
    <section className="c4">
      <h2>C4 checks</h2>
      <p className="note">A note counts something that is missing, and is no problem of the check.</p>
      <ul className="c4-checks">
        {C4_CODES.map((code) => {
          const check = report[code];
          // The words are the core library's, so that a line here reads as the command's line does.
          const line = c4Line(report, code);
          return (
            <li key={code} className="c4-check" data-code={code}>
              {check.findings.length === 0 ? (
                line
              ) : (
                <details>
                  <summary>{line}</summary>
                  <ol className="problems">
                    {check.findings.map((finding, at) => (
                      <FoundItem key={at} found={{ ...finding, severity: check.severity, code }} />
                    ))}
                  </ol>
                </details>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/**
 * The page of problems, and under them what the C4 checks counted. With no report, as from a
 * server older than the checks, there is no such block.
 */
export function Problems({ problems, c4 }: { problems: readonly Problem[]; c4: C4Report | undefined }) {
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
      {c4 !== undefined && <C4Checks report={c4} />}
    </article>
  );
}
