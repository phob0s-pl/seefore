import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { parse } from 'yaml';

// The plugin's frame, held now and when each skill's text is written.

const root = (path: string): string => fileURLToPath(new URL(`../${path}`, import.meta.url));

/** Each skill, and the stage of plan 3 that writes its text. */
const SKILLS = ['model', 'flows', 'context', 'change', 'review'];

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

test('the plugin holds the five skills and no other', async () => {
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
  expect(tools.includes('Bash(seefore rename *)')).toBe(skill === 'model');
  expect(matter.context).toBe(skill === 'review' ? 'fork' : undefined);
});
