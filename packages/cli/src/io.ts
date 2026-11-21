/** What the command needs from the world around it. Tests give it one of their own. */
export interface Io {
  /** The folder the command was run in. */
  cwd: string;
  /** Prints a result. */
  out(text: string): void;
  /** Prints why the command could not do its work. */
  err(text: string): void;
}
