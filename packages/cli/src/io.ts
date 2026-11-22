/** What the command needs from the world around it. Tests give it one of their own. */
export interface Io {
  /** The folder the command was run in. */
  cwd: string;
  /** Prints a result. */
  out(text: string): void;
  /** Prints why the command could not do its work. */
  err(text: string): void;
  /** How many columns the terminal has, when the result is printed to one. Missing for a file or a pipe. */
  columns?: number;
  /** True when the output goes to a terminal, where a person reads it. */
  terminal?: boolean;
  /**
   * The folder the built command is in, with the page and the layout's worker beside it.
   * Missing when the command runs from its source, where nothing is built.
   */
  home?: string;
  /** Opens an address in the browser. Missing where there is none to open. */
  open?(address: string): void;
  /** Waits until the person asks the command to stop, as with Ctrl+C. Missing where nobody can. */
  untilStopped?(): Promise<void>;
}
