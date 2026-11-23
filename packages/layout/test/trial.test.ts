import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * `scripts/steady.mjs`, run as a process on source directories made for the test, as a person
 * runs it: what it counts, what it calls not tried, and its exit code. It is the stage's
 * measure, so a share it gives must rest on something it tried.
 */

const SCRIPT = fileURLToPath(new URL('../../../scripts/steady.mjs', import.meta.url));
const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));

let root: string;

beforeAll(() => {
  root = realpathSync(mkdtempSync(join(tmpdir(), 'seefore-steady-')));
  const marker = (name: string) => ({ 'seefore.yaml': `format: 1\nname: ${name}\n` });
  const app = (id: string, system: string) => ({ [`apps/${id}.yaml`]: `name: ${id}\nin: ${system}\n` });
  const store = (id: string, system: string) => ({ [`stores/${id}.yaml`]: `name: ${id}\nin: ${system}\n` });
  const system = (id: string, external = false) => ({ [`systems/${id}.yaml`]: `name: ${id}\n${external ? 'external: true\n' : ''}` });
  const person = (id: string) => ({ [`people/${id}.yaml`]: `name: ${id}\n` });
  const link = (from: string, to: string) => ({ [`connections/${from}-to-${to}.yaml`]: `from: ${from}\nto: ${to}\nname: ${from} asks ${to}\n` });
  // A shop whose apps talk among themselves: a connection added between two of them does not reach its context view.
  write('unreached', { ...marker('Shop'), ...system('shop'), ...system('bank', true), ...person('customer'), ...app('web', 'shop'), ...app('api', 'shop'), ...app('worker', 'shop'), ...store('db', 'shop'), ...link('customer', 'web'), ...link('web', 'api'), ...link('api', 'db'), ...link('worker', 'db'), ...link('api', 'bank') });
  // Of the edits made together, the first takes out `z9`, the last app by id, and the third,
  // a connection from the last box inside, would name `z9` on the model as it was.
  write('together', { ...marker('Shop'), ...system('shop'), ...person('clerk'), ...app('a1', 'shop'), ...app('a2', 'shop'), ...app('z9', 'shop'), ...store('s1', 'shop'), ...link('clerk', 'a1'), ...link('a1', 'a2'), ...link('a2', 's1'), ...link('z9', 's1') });
  // One system of one app: no edit leaves two boxes that stand in both pictures.
  write('alone', { ...marker('Alone'), ...system('solo'), ...app('only', 'solo') });
  write('broken', { ...marker('Broken'), ...system('solo'), ...app('only', 'solo'), ...link('only', 'nowhere') });
  mkdirSync(join(root, 'empty'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

/** Writes the files of a source directory under the temporary folder. */
function write(directory: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, directory, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

/** What a run of the script gave: its exit code, and all it wrote, read through pipes. */
interface Run {
  code: number | null;
  out: string;
  err: string;
}

/** Runs the script from the repository's root on directories of the temporary folder. */
function run(...args: string[]): Promise<Run> {
  return new Promise((done, failed) => {
    const child = spawn(process.execPath, [SCRIPT, ...args.map((arg) => (arg.startsWith('--') ? arg : join(root, arg)))], { cwd: REPOSITORY });
    const out: Buffer[] = [];
    const err: Buffer[] = [];
    child.stdout.on('data', (chunk: Buffer) => out.push(chunk));
    child.stderr.on('data', (chunk: Buffer) => err.push(chunk));
    child.on('error', failed);
    child.on('close', (code) => done({ code, out: Buffer.concat(out).toString('utf8'), err: Buffer.concat(err).toString('utf8') }));
  });
}

/** The tries of one main view, and what they rest on, as the script gives them in `--json`. */
interface Shares {
  tried: number;
  notReached: number;
  gone: number;
  notDrawn: number;
  measured: number;
  noPair: number;
  orderKept?: { edits: number; pairs: number; mean: number; worst: number };
  columnOrder?: { edits: number; pairs: number; mean: number; worst: number };
}

/** What the script gives in `--json`, as far as the tests read it. */
interface Trial {
  directories: {
    containers: { rows: { edit: string; pairs: number }[] };
    context: { rows: { edit: string; pairs: number }[] };
    shares: { containers: Shares; context: Shares };
    together?: { edits: number; kinds: string[]; containers: unknown; context: unknown };
  }[];
  all: {
    column: { adds?: { edits: number; worst: number }; takes?: { edits: number; worst: number } };
    worstInColumn: { edit: string; adds: boolean; columnOrder: number }[];
  };
  passes: { number: number; status: 'passes' | 'fails' | 'not tried'; measured: string }[];
}

/** The status of each pass number, by number. */
function statuses(trial: Trial): Record<number, string> {
  return Object.fromEntries(trial.passes.map((each) => [each.number, each.status]));
}

describe('the trial script', () => {
  it('counts apart an edit that does not reach the context view, and puts it in no share', async () => {
    const result = await run('--json', 'unreached');
    const trial = JSON.parse(result.out) as Trial;
    const [directory] = trial.directories;
    const context = directory?.shares.context;
    expect(context?.notReached).toBeGreaterThan(0);
    // Every try is measured or counted apart, and each share rests on the edits that have a pair.
    expect((context?.measured ?? 0) + (context?.notReached ?? 0) + (context?.gone ?? 0) + (context?.notDrawn ?? 0)).toBe(context?.tried);
    expect(context?.orderKept?.edits).toBe((context?.measured ?? 0) - (context?.noPair ?? 0));
    expect(context?.orderKept?.pairs).toBe(directory?.context.rows.reduce((sum, row) => sum + row.pairs, 0));
    // A connection between two apps inside never reaches the context view; in the container view it is measured.
    expect(directory?.context.rows.map((row) => row.edit)).not.toContain('add-connection');
    expect(directory?.containers.rows.map((row) => row.edit)).toContain('add-connection');
    // Pass number 7, of a crowded view, went with the check: six are tried, and the exit code follows them.
    expect(Object.keys(statuses(trial))).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(result.code).toBe(trial.passes.every((each) => each.status === 'passes') ? 0 : 1);
  }, 60_000);

  it('works out each of the edits made together on the model the one before left', async () => {
    const result = await run('--json', 'together');
    // A model that names a record an edit took out is not sound, and ends the run with code 3.
    expect(result.err).not.toContain('not sound');
    expect(result.code).not.toBe(3);
    const together = (JSON.parse(result.out) as Trial).directories[0]?.together;
    expect(together?.kinds).toEqual(['remove-app', 'add-app', 'add-connection', 'add-neighbour', 'rename']);
    // The boxes inside but `z9`, and the clerk, stand in both pictures of the container view.
    expect(together?.containers).toHaveProperty('common', 4);
  }, 60_000);

  it('holds the worst edit of pass number 3 to its floor among the edits that add something, and shows the worst of the others beside it', async () => {
    const trial = JSON.parse((await run('--json', 'unreached')).out) as Trial;
    const { column, worstInColumn } = trial.all;
    // An edit that adds something is told by its name, and each worst edit says which kind it is.
    for (const row of worstInColumn) expect(row.adds).toBe(row.edit.startsWith('add-'));
    expect(worstInColumn.filter((row) => row.adds).length).toBeLessThanOrEqual(3);
    expect(worstInColumn.filter((row) => !row.adds).length).toBeLessThanOrEqual(3);
    // Both kinds have an edit with a pair in one column here, and every such edit is in one of the two.
    const rows = trial.directories[0]?.containers.rows as { edit: string; columnOrder?: number }[];
    const shared = rows.filter((row) => row.columnOrder !== undefined);
    expect(column.adds?.edits).toBe(shared.filter((row) => row.edit.startsWith('add-')).length);
    expect(column.takes?.edits).toBe(shared.filter((row) => !row.edit.startsWith('add-')).length);
    expect(column.adds?.worst).toBe(Math.min(...shared.filter((row) => row.edit.startsWith('add-')).map((row) => row.columnOrder as number)));
    // The pass number says both, and its status follows the edits that add and the mean alone.
    const third = trial.passes.find((each) => each.number === 3);
    expect(third?.measured).toContain('worst edit that adds something');
    expect(third?.measured).toContain('worst edit that takes out or moves');
    expect(third?.measured).toContain('which has no floor');
    const mean = shared.reduce((sum, row) => sum + (row.columnOrder as number), 0) / shared.length;
    expect(third?.status).toBe(mean >= 0.95 && (column.adds?.worst ?? 0) >= 0.75 ? 'passes' : 'fails');
  }, 60_000);

  it('calls a measure with no pair to compare not tried, and does not pass', async () => {
    const result = await run('--json', 'alone');
    const trial = JSON.parse(result.out) as Trial;
    const shares = trial.directories[0]?.shares;
    expect(shares?.containers.tried).toBeGreaterThan(0);
    expect(shares?.containers.orderKept).toBeUndefined();
    expect(shares?.containers.columnOrder).toBeUndefined();
    expect(shares?.context.orderKept).toBeUndefined();
    expect(statuses(trial)).toEqual({ 1: 'passes', 2: 'passes', 3: 'not tried', 4: 'not tried', 5: 'not tried', 6: 'passes' });
    expect(result.code).toBe(1);
  }, 60_000);

  it('says why it cannot try an empty folder, or one with an error, and ends with exit code 2', async () => {
    for (const directory of ['empty', 'broken']) {
      const result = await run(directory);
      expect(result.code).toBe(2);
      expect(result.out).toBe('');
      expect(result.err).toContain(join(root, directory));
      // The sentence names nothing from inside the directory.
      expect(result.err).not.toContain('nowhere');
    }
    expect((await run('empty')).err).toContain('has no seefore.yaml');
    expect((await run('broken')).err).toContain('seefore check finds an error in it');
  }, 60_000);

  it('gives the whole of its data through a pipe, however long', async () => {
    // More than a pipe holds at once: a process that ends as soon as it has written cuts it.
    const result = await run('--json', ...Array<string>(40).fill('alone'));
    expect(result.out.length).toBeGreaterThan(65_536);
    expect((JSON.parse(result.out) as Trial).directories).toHaveLength(40);
    expect(result.code).toBe(1);
  }, 120_000);
});
