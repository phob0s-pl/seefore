import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

// The plugin's frame, held now and when each skill's text is written.

const root = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Each skill, and the stage of plan 3 that writes its text. */
const SKILLS = ['model', 'flows', 'context', 'change', 'answer', 'review'];

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

test.each(SKILLS)('the skill %s has its front matter, at most 120 lines and no word of Git', async (skill) => {
  const text = await readFile(root(`plugin/skills/${skill}/SKILL.md`), 'utf8');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  expect(lines.length).toBeLessThanOrEqual(120);
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
