import type { Count, Ruling } from './answer.ts';
import { list } from './problem.ts';

/** What a record that nothing names is called, by its folder: one, and many. */
const UNUSED: Record<string, [string, string]> = {
  owners: ['owner', 'owners'],
  technologies: ['technology', 'technologies'],
  data: ['data record', 'data records'],
};

/** What a part that no connection names is called, by its folder: one, and many. */
const ALONE: Record<string, [string, string]> = {
  apps: ['app', 'apps'],
  stores: ['store', 'stores'],
  components: ['component', 'components'],
};

/** What each count looks for, in a few words: said of the counts that were not made. */
const LOOKS_FOR: Record<string, string> = {
  'record-unused': 'owners, technologies and data that nothing names',
  'part-alone': 'apps, stores and components that no connection names',
  'feature-alone': 'features that no flow names and that touch nothing',
  'step-unplaced': 'steps with neither `does` nor `reply`',
};

/** The ids a count found, by the folders in `nouns`, in their order, and the noun for them. */
function byFolder(count: Count, nouns: Record<string, [string, string]>): { nouns: string; ids: string } {
  const folders = Object.keys(nouns).filter((folder) => count.found.some((item) => item.file.startsWith(`${folder}/`)));
  return {
    nouns: folders.map((folder) => (nouns[folder] as [string, string])[count.found.length !== 1 ? 1 : 0]).join(' or '),
    ids: folders.flatMap((folder) => count.found.filter((item) => item.file.startsWith(`${folder}/`)).map((item) => `\`${item.record}\``)).join(', '),
  };
}

/**
 * The lines the counts come to, said after the problems. A count is made only of a model with
 * no error: the counts that were not made are said in one line, by what each looks for.
 */
export function countLines(counts: readonly Count[]): string[] {
  const lines = counts.filter((count) => count.checked !== null).map(countLine).filter((line): line is string => line !== undefined);
  const left = counts.filter((count) => count.checked === null).map((count) => LOOKS_FOR[count.rule] ?? count.says);
  return left.length === 0 ? lines : [...lines, `Not counted until the errors are mended: ${left.join('; ')}.`];
}

/**
 * The one line that says what a count found, for the command and for the page alike. Nothing
 * when it found nothing. A count is no problem, so the line is said after the problems.
 */
export function countLine(count: Count): string | undefined {
  const n = count.found.length;
  const many = n !== 1;
  switch (count.rule) {
    case 'record-unused': {
      if (count.checked === null) return `Not counted until the errors are mended: ${LOOKS_FOR[count.rule]}.`;
      if (n === 0) return undefined;
      // The ids in the order of their nouns: owners, technologies, then data.
      const found = byFolder(count, UNUSED);
      return `${n} ${found.nouns} that nothing names: ${found.ids}.`;
    }
    case 'part-alone': {
      if (count.checked === null) return `Not counted until the errors are mended: ${LOOKS_FOR[count.rule]}.`;
      if (n === 0) return undefined;
      const found = byFolder(count, ALONE);
      return `${n} ${found.nouns} that no connection names: ${found.ids}.`;
    }
    case 'feature-alone':
      if (count.checked === null) return `Not counted until the errors are mended: ${LOOKS_FOR[count.rule]}.`;
      if (n === 0) return undefined;
      return `${n} ${many ? 'features that no flow names and that touch' : 'feature that no flow names and that touches'} nothing: ${list(count.found.map((item) => item.record ?? ''))}.`;
    case 'step-unplaced':
      if (count.checked === null) return `Not counted until the errors are mended: ${LOOKS_FOR[count.rule]}.`;
      if (n === 0) return undefined;
      return `${n} ${many ? 'steps' : 'step'} with neither \`does\` nor \`reply\`, in ${list([...new Set(count.found.map((item) => item.record ?? ''))])}.`;
  }
  if (count.checked === null) return `Not counted until the errors are mended: ${count.says}`;
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
