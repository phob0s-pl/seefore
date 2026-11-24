import type { Count, Ruling } from './answer.ts';
import { list } from './problem.ts';

/** What a record that nothing names is called, by its folder: one, and many. */
const UNUSED: Record<string, [string, string]> = {
  owners: ['owner', 'owners'],
  technologies: ['technology', 'technologies'],
  data: ['data record', 'data records'],
};

/**
 * The one line that says what a count found, for the command and for the page alike. Nothing
 * when it found nothing. A count is no problem, so the line is said after the problems.
 */
export function countLine(count: Count): string | undefined {
  const n = count.found.length;
  const many = n !== 1;
  switch (count.rule) {
    case 'record-unused': {
      if (count.checked === null) return 'Not counted: owners, technologies and data that nothing names, since a file could not be read.';
      if (n === 0) return undefined;
      // The ids in the order of their nouns: owners, technologies, then data.
      const folders = Object.keys(UNUSED).filter((folder) => count.found.some((item) => item.file.startsWith(`${folder}/`)));
      const nouns = folders.map((folder) => (UNUSED[folder] as [string, string])[many ? 1 : 0]).join(' or ');
      const ids = folders.flatMap((folder) => count.found.filter((item) => item.file.startsWith(`${folder}/`)).map((item) => `\`${item.record}\``));
      return `${n} ${nouns} that nothing names: ${ids.join(', ')}.`;
    }
    case 'feature-alone':
      if (count.checked === null) return 'Not counted: features that no flow names and that touch nothing, since a file could not be read.';
      if (n === 0) return undefined;
      return `${n} ${many ? 'features that no flow names and that touch' : 'feature that no flow names and that touches'} nothing: ${list(count.found.map((item) => item.record ?? ''))}.`;
    case 'step-unplaced':
      if (count.checked === null) return 'Not counted: steps with neither `does` nor `reply`, since a file could not be read.';
      if (n === 0) return undefined;
      return `${n} ${many ? 'steps' : 'step'} with neither \`does\` nor \`reply\`, in ${list([...new Set(count.found.map((item) => item.record ?? ''))])}.`;
  }
  if (count.checked === null) return `Not counted, since a file could not be read: ${count.says}`;
  return n > 0 ? `${n} found: ${count.says}` : undefined;
}

/**
 * The one line that says what the rules of the team's own came to: "14 rules of your own: 12
 * hold, 2 broken. 2 of debt." Nothing when there is no rule.
 */
export function rulingsLine(rulings: readonly Ruling[]): string | undefined {
  if (rulings.length === 0) return undefined;
  const of = (state: Ruling['state']) => rulings.filter((ruling) => ruling.state === state).length;
  const parts = [
    [of('holds'), of('holds') === 1 ? 'holds' : 'hold'],
    [of('broken'), 'broken'],
    [of('nothing'), of('nothing') === 1 ? 'looks at nothing' : 'look at nothing'],
    [of('not-judged'), 'not judged'],
  ] as const;
  const said = parts.filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`);
  const debt = rulings.reduce((sum, ruling) => sum + ruling.debt.length, 0);
  const rules = `${rulings.length} ${rulings.length === 1 ? 'rule' : 'rules'} of your own: ${said.join(', ')}.`;
  return debt > 0 ? `${rules} ${debt} of debt.` : rules;
}
