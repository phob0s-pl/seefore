import type { Count } from './answer.ts';

/**
 * The one line that says what a count found, for the command and for the page alike. Nothing
 * when it found nothing. A count is no problem, so the line is said after the problems.
 */
export function countLine(count: Count): string | undefined {
  if (count.rule !== 'record-unused') {
    if (count.checked === null) return `Not counted, since a file could not be read: ${count.says}`;
    return count.found.length > 0 ? `${count.found.length} found: ${count.says}` : undefined;
  }
  if (count.checked === null) return 'Not counted: owners and technologies that nothing names, since a file could not be read.';
  if (count.found.length === 0) return undefined;
  const names = count.found.map((item) => `\`${item.record}\``).join(', ');
  return `${count.found.length === 1 ? '1 owner or technology' : `${count.found.length} owners or technologies`} that nothing names: ${names}.`;
}
