import type { Failed } from '@seefore/core';

/**
 * What a view whose layout did not finish says in place of its picture. Plain words: the page
 * shows them to a reader as they are.
 */

/** A view that was not laid out, for the reason given, with the words to show. */
export function failed(view: string, reason: Failed['failed']['reason'], message: string): Failed {
  return { view, failed: { reason, message } };
}

/** The words for a layout stopped at its limit, given in milliseconds. */
export function tooLong(limit: number): string {
  return `This view took more than ${seconds(limit)} to lay out, so it was stopped and is not drawn. The other views still draw.`;
}

/** The name of a Java exception at the start of what ELK says, which tells a reader nothing: `org.eclipse.elk.graph.json.JsonImportException: `. */
const JAVA_EXCEPTION = /^(?:[\w$]+\.)+[\w$]*(?:Exception|Error): /u;

/** The words for a layout that threw: what happened, and what the layout engine said. */
export function threw(error: unknown): string {
  const said = (error instanceof Error ? error.message : String(error)).trim().replace(JAVA_EXCEPTION, '').replace(/\.$/u, '');
  const quoted = said === '' ? '' : ` The layout engine said: “${said}”.`;
  return `This view could not be laid out, so it is not drawn. The other views still draw.${quoted}`;
}

/** The words for a layout whose thread stopped before it answered. */
export function stopped(): string {
  return 'The layout of this view stopped before it finished, so it is not drawn. The other views still draw.';
}

/** The words for a view that was waiting when the layout was closed, as the server stops. */
export function closed(): string {
  return 'The layout was closed before this view was laid out, so it is not drawn.';
}

/** A time in milliseconds as a reader says it: `5 seconds`, `1 second`, `0.25 seconds`. */
function seconds(milliseconds: number): string {
  const value = Number((milliseconds / 1000).toFixed(3));
  return value === 1 ? '1 second' : `${value} seconds`;
}
