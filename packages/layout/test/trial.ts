import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * What the tests of `scripts/steady.mjs` share: source directories written under a temporary
 * folder, the files of a model, and a run of the script as a person runs it, as a process from
 * the repository's root.
 */

const SCRIPT = fileURLToPath(new URL('../../../scripts/steady.mjs', import.meta.url));
const REPOSITORY = fileURLToPath(new URL('../../../', import.meta.url));

/** A temporary folder for the source directories of a test file. */
export function newRoot(): string {
  return realpathSync(mkdtempSync(join(tmpdir(), 'seefore-steady-')));
}

/** Takes the temporary folder away. */
export function removeRoot(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

/** Writes the files of a source directory under the temporary folder. */
export function write(root: string, directory: string, files: Record<string, string>): void {
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, directory, path);
    mkdirSync(dirname(full), { recursive: true });
    writeFileSync(full, text);
  }
}

/** The files of a model: each gives the file of one record, as a person writes it. */
export const files = {
  marker: (name: string) => ({ 'seefore.yaml': `format: 1\nname: ${name}\n` }),
  system: (id: string, external = false) => ({ [`systems/${id}.yaml`]: `name: ${id}\n${external ? 'external: true\n' : ''}` }),
  person: (id: string) => ({ [`people/${id}.yaml`]: `name: ${id}\n` }),
  app: (id: string, system: string) => ({ [`apps/${id}.yaml`]: `name: ${id}\nin: ${system}\n` }),
  store: (id: string, system: string) => ({ [`stores/${id}.yaml`]: `name: ${id}\nin: ${system}\n` }),
  component: (id: string, app: string) => ({ [`components/${id}.yaml`]: `name: ${id}\nin: ${app}\n` }),
  link: (from: string, to: string) => ({ [`connections/${from}-to-${to}.yaml`]: `from: ${from}\nto: ${to}\nname: ${from} asks ${to}\n` }),
};

/** What a run of the script gave: its exit code, and all it wrote, read through pipes. */
export interface Run {
  code: number | null;
  out: string;
  err: string;
}

/** Runs the script from the repository's root on directories of the temporary folder: an argument that starts with `--` is an option, any other a directory. */
export function run(root: string, ...args: string[]): Promise<Run> {
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

/** A share over edits or changes, as the script gives it in `--json`. */
export interface Share {
  edits: number;
  pairs: number;
  mean: number;
  worst: number;
}

/** The tries of one measure, and what they rest on, as the script gives them in `--json`. */
export interface Shares {
  tried?: number;
  notReached?: number;
  gone?: number;
  notDrawn?: number;
  measured: number;
  noPair: number;
  orderKept?: Share;
  columnOrder?: Share;
  adds?: Share;
  takes?: Share;
}

/** One row of a measure: an edit and the change it made. */
export interface Row {
  edit: string;
  at: number;
  pairs: number;
  orderKept?: number;
  columnOrder?: number;
  columnPairs: number;
  boundaries?: [number, number];
  nested?: [boolean, boolean];
  insidePairs?: number;
  insideKept?: number;
  where?: string;
}

/** The changes of depth of one kind, as the script gives them in `--json`. */
export interface Changes {
  notDrawn: number;
  changes: number;
  opened: number;
  common: number;
  kept?: Share;
  alone?: Share;
}

/** The shares of a directory, or of all, by measure, as the script gives them in `--json`. */
export interface AllShares {
  containers?: Shares;
  context?: Shares;
  everythingSystem?: Shares;
  everythingContainer?: Shares;
  everythingComponent?: Shares;
  boundaries?: Shares;
  nested?: Shares;
  systemComponent?: Shares;
  appComponent?: Shares;
  components?: Shares;
  inside: { container?: Share; component?: Share };
  depth?: Record<string, Changes | undefined>;
}

/** What the two pictures of stage 5 came to against the code of stage 8. */
export interface Stage8 {
  compared: number;
  missing: number;
  viewsDiffer: number;
  picturesDiffer: number;
  notInFile: number;
}

/** What the script gives in `--json`, as far as the tests read it. */
export interface Trial {
  directories: {
    label: string;
    settings: number;
    containers?: { rows: Row[] };
    context?: { rows: Row[] };
    whole?: Record<string, { tried: number; rows: Row[] } | undefined>;
    components?: { tried: number; rows: Row[] };
    depth?: Record<string, { notDrawn: number; rows: { opened: number; common: number; pairs: number; orderKept?: number }[] } | undefined>;
    same?: { tried: number; differ: number; notDrawn: number };
    stage8?: Stage8;
    words: { tried: number; notReached: number; moved: number };
    shares: AllShares;
    together?: { edits: number; kinds: string[]; containers: unknown; context: unknown };
    tally: { layouts: number; walk: { pairs: number; against: number; views: number }; geometry: { pictures: number; troubles: number } };
    notes: string[];
  }[];
  all: {
    settings: number;
    layouts: number;
    column: { adds?: { edits: number; worst: number }; takes?: { edits: number; worst: number } };
    worstInColumn: { edit: string; adds: boolean; columnOrder: number }[];
    shares: AllShares;
    walk: { pairs: number; against: number; views: number };
    same?: { tried: number; differ: number; notDrawn: number };
    stage8?: Stage8;
  };
  passes: { number: number; what: string; bar: string; status: 'passes' | 'fails' | 'not tried'; measured: string }[];
}

/** The status of each pass number, by number. */
export function statuses(trial: Trial): Record<number, string> {
  return Object.fromEntries(trial.passes.map((each) => [each.number, each.status]));
}
