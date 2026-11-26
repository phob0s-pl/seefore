import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

// The plugin's frame, held now and when each skill's text is written.

const root = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Each skill, and the stage of plan 3 that writes its text. */
const SKILLS = ['model', 'flows', 'context', 'change', 'answer', 'review'];

/** The lines a skill may have: 120, and 180 for the two that hold the rules of reading the code in their own text (the owner, 2026-11-27). */
const MOST: Record<string, number> = { change: 180, review: 180 };

/** The words of a Git workflow, which no skill holds. */
const GIT = /\bgit\b|\bcommit|\bbranch|pull request|\bmerge/i;

const json = async (path: string): Promise<Record<string, unknown>> => JSON.parse(await readFile(root(path), 'utf8')) as Record<string, unknown>;

test('the plugin and the marketplace name the plugin seefore', async () => {
  const plugin = await json('plugin/.claude-plugin/plugin.json');
  const pkg = await json('package.json');
  expect(plugin.name).toBe('seefore');
  expect(plugin.version).toBe(pkg.version);
  expect(typeof plugin.description).toBe('string');

  const market = await json('.claude-plugin/marketplace.json');
  expect(market.name).toBe('seefore');
  expect(market.owner).toEqual({ name: 'seefore' });
  expect(market.plugins).toEqual([expect.objectContaining({ name: 'seefore', source: './plugin' })]);
});

test('the plugin holds the six skills and no other', async () => {
  const folders = (await readdir(root('plugin/skills'), { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => entry.name);
  expect(folders.sort()).toEqual([...SKILLS].sort());
});

test.each(SKILLS)('the skill %s has its front matter, no more lines than its limit and no word of Git', async (skill) => {
  const text = await readFile(root(`plugin/skills/${skill}/SKILL.md`), 'utf8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  expect(lines.length).toBeLessThanOrEqual(MOST[skill] ?? 120);
  expect(text.match(GIT)?.[0]).toBeUndefined();

  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(front, 'front matter between two lines of ---').not.toBeNull();
  const matter = parse(front?.[1] ?? '') as Record<string, unknown>;
  expect(matter.name).toBe(skill);
  expect(typeof matter.description).toBe('string');
  expect(matter['disable-model-invocation']).toBe(true);
  const tools = String(matter['allowed-tools']);
  for (const verb of ['check', 'list', 'guide']) expect(tools).toContain(`Bash(seefore ${verb} *)`);
  for (const verb of ['rename', 'remove']) expect(tools.includes(`Bash(seefore ${verb} *)`)).toBe(skill === 'model');
  // Only the skill that answers a review decides a change, so only it may apply one.
  expect(tools.includes('Bash(seefore apply *)')).toBe(skill === 'answer');
  // Those and no other command: three each, with two more for model and one more for answer.
  expect(tools.match(/\bBash\(/g)).toHaveLength(skill === 'model' ? 5 : skill === 'answer' ? 4 : 3);
  expect(matter.context).toBe(skill === 'review' ? 'fork' : undefined);
});

/** The readers that the skill `review` starts, each an agent of the plugin with a fresh context. */
const READERS = ['plain', 'assumed', 'failure', 'trust'];

test('the plugin ships the readers of a review and no other agent, and the skill review names each', async () => {
  const files = (await readdir(root('plugin/agents'))).filter((name) => name.endsWith('.md')).map((name) => name.slice(0, -'.md'.length));
  expect(files.sort()).toEqual([...READERS].sort());
  const review = await readFile(root('plugin/skills/review/SKILL.md'), 'utf8');
  for (const reader of READERS) expect(review).toContain(`\`seefore:${reader}\``);
});

test.each(READERS)('the reader %s reads and writes nothing: its front matter, at most 80 lines and no word of Git', async (reader) => {
  const text = await readFile(root(`plugin/agents/${reader}.md`), 'utf8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  expect(lines.length).toBeLessThanOrEqual(80);
  expect(text.match(GIT)?.[0]).toBeUndefined();

  const front = /^---\n([\s\S]*?)\n---\n/.exec(text);
  expect(front, 'front matter between two lines of ---').not.toBeNull();
  const matter = parse(front?.[1] ?? '') as Record<string, unknown>;
  expect(matter.name).toBe(reader);
  expect(typeof matter.description).toBe('string');
  // A reader has no shell and no way to write: what it finds comes back as its answer alone.
  expect(matter.tools).toBe('Read, Glob, Grep');
  expect(matter.model).toBe('opus');
  expect(matter.effort).toBe('medium');
});

test('the reader plain alone reads the code, and the skills change and review say where it is in reach', async () => {
  const reader = (name: string): Promise<string> => readFile(root(`plugin/agents/${name}.md`), 'utf8');
  const skill = (name: string): Promise<string> => readFile(root(`plugin/skills/${name}/SKILL.md`), 'utf8');
  const plain = await reader('plain');
  expect(plain).toContain('## The code in reach');
  expect(plain).toContain('## Only the design');
  expect(plain).not.toContain('Read no code');
  // A reader with a lens reads the model alone, and hears of no folder: its numbers were measured so.
  for (const lens of READERS.filter((name) => name !== 'plain')) {
    expect(await reader(lens)).toContain('Read no code.');
    expect(await reader(lens)).not.toContain('The code in reach');
  }
  for (const name of ['change', 'review']) {
    // A sentence may run over the end of a line.
    const text = (await skill(name)).replace(/\s+/g, ' ');
    expect(text).toContain('The code in reach');
    // What is in reach comes from the records of repositories, never from a search for a folder.
    expect(text).toContain('seefore list repositories');
    expect(text).toMatch(/never look for it/i);
    // A place of the code lives in a last message alone.
    expect(text).toContain('No file, folder or line of the code stands in');
  }
  const review = (await skill('review')).replace(/\s+/g, ' ');
  // The folders go to one reader, and what it cites is opened before its point is kept.
  expect(review).toContain('To `plain` alone add a line for each folder in reach');
  expect(review).toContain('Before you keep it, open that file, in a folder you handed');
  // What a search did not find is told by the repository's id, never by a folder.
  expect((await skill('change')).replace(/\s+/g, ' ')).toContain('"I searched the code of `<the repository\'s id>`');
  expect(await skill('change')).not.toContain('`<folder>`');
  // The skills that draft and correct from a person's word alone stay as they were.
  for (const name of ['context', 'answer']) expect(await skill(name)).not.toContain('The code in reach');
});
