import { CST, Lexer, LineCounter, isMap, isNode, isPair, isScalar, parseAllDocuments, visit } from 'yaml';
import type { Document, YAMLError, YAMLMap } from 'yaml';
import { START, error, quote } from './problem.ts';
import type { Position, Problem } from './problem.ts';

/** A YAML file after reading: its top mapping when it is sound, and what is wrong when not. */
export interface YamlFile {
  /** The parsed document. Present only when the file broke no rule below. */
  doc?: Document;
  /** The mapping at the top of the document. Present with `doc`. */
  map?: YAMLMap;
  problems: Problem[];
  /** Where a node of this file starts. Anything that is not a node gives the start of the file. */
  at(node: unknown): Position;
}

/** What a file read by `readYaml` has, beyond its kind, that changes what its messages say. */
export interface ReadOptions {
  /**
   * The key a note can be written in instead of a comment: `description` for a record, which
   * is what it is when nothing is said. The marker has no such key, and passes `null`.
   */
  notesIn?: string | null;
}

/**
 * Reads one YAML file under seefore's rules: YAML 1.2 with its core types, one document, a
 * mapping at the top, text keys, no directives, anchors, aliases, tags or comments, and no key
 * twice.
 *
 * `what` names the kind of file for messages, as in "The marker file" or "A record".
 */
export function readYaml(file: string, text: string, what: string, options: ReadOptions = {}): YamlFile {
  // A lone carriage return ends a line in YAML. The parser wants a line feed; swapping one
  // for the other keeps every offset, so lines and columns stay true.
  const source = text.replace(/\r(?!\n)/g, '\n');
  const lines = new LineCounter();
  const problems: Problem[] = [];

  const atOffset = (offset: number): Position => {
    const { line, col } = lines.linePos(offset);
    return { line: Math.max(line, 1), column: Math.max(col, 1) };
  };
  const at = (node: unknown): Position => {
    if (isNode(node) && node.range) return atOffset(node.range[0]);
    return START;
  };
  const broken = (): YamlFile => ({ problems, at });

  // The version and the types are fixed, so a file cannot change what its own values mean.
  const docs = parseAllDocuments(source, {
    lineCounter: lines,
    uniqueKeys: true,
    prettyErrors: false,
    version: '1.2',
    schema: 'core',
  });

  if (docs.length === 0) {
    problems.push(error(file, START, 'yaml-empty', `This file is empty. ${what} is a mapping of keys and values.`));
    return broken();
  }

  const doc = docs[0] as Document;
  const tokens = tokensOf(source);

  const faults: YAMLError[] = [];
  for (const fault of doc.errors) {
    if (fault.code === 'DUPLICATE_KEY') {
      const key = keyStartingAt(doc, fault.pos[0]);
      const named = key === undefined ? 'A key' : `The key ${quote(key)}`;
      problems.push(error(file, atOffset(fault.pos[0]), 'yaml-key-twice', `${named} is written twice in one mapping. Keep one.`));
    } else {
      faults.push(fault);
    }
  }
  for (const slip of slips(faults, source, tokens, lines)) problems.push(error(file, atOffset(slip.offset), 'yaml-syntax', slip.message));
  if (problems.length > 0) return broken();

  // Directives, anchors, aliases, tags and comments are found in the text itself, so each is
  // reported exactly where it is written.
  const notesIn = options.notesIn === undefined ? 'description' : options.notesIn;
  for (const mark of marks(tokens, emptyValues(doc))) {
    problems.push(error(file, atOffset(mark.offset), MARK_CODES[mark.type], markMessage(mark, what, notesIn)));
  }
  if (problems.length > 0) return broken();

  // Anything else the parser was unsure about is a fault here: a file is read fully or not at all.
  for (const slip of slips(doc.warnings, source, tokens, lines)) problems.push(error(file, atOffset(slip.offset), 'yaml-syntax', slip.message));
  if (problems.length > 0) return broken();

  if (docs.length > 1) {
    const second = docs[1] as Document;
    const where = second.range ? atOffset(second.range[0]) : START;
    problems.push(error(file, where, 'yaml-many-documents', 'This file holds more than one YAML document. Keep one.'));
    return broken();
  }

  const top = doc.contents;
  if (!isMap(top)) {
    const found = top === null ? 'nothing' : isScalar(top) ? 'a single value' : 'a list';
    problems.push(
      error(file, at(top), 'yaml-not-mapping', `${what} is a mapping of keys and values, but this file holds ${found}.`),
    );
    return broken();
  }

  visit(doc, {
    Pair(_key, pair) {
      if (!isScalar(pair.key) || typeof pair.key.value !== 'string') {
        problems.push(error(file, at(pair.key), 'yaml-key-not-text', 'A key must be plain text.'));
      }
    },
  });
  if (problems.length > 0) return broken();

  return { doc, map: top, problems, at };
}

/**
 * Reads one key at the top of a file without holding the file to seefore's rules. It is for
 * the one question that must be answered before any rule applies: which format a directory
 * is written in. Returns nothing when the text cannot be parsed or has no mapping at the top.
 */
export function peekTop(text: string, key: string): unknown {
  const docs = parseAllDocuments(text.replace(/\r(?!\n)/g, '\n'), { prettyErrors: false, version: '1.2', schema: 'core' });
  const doc = docs[0];
  if (!doc || doc.errors.some((fault) => fault.code !== 'DUPLICATE_KEY') || !isMap(doc.contents)) return undefined;
  const value: unknown = doc.contents.get(key);
  return value;
}

/** The place of a key in a mapping, or of the mapping itself when the key is not there. */
export function keyPosition(yaml: YamlFile, map: YAMLMap, key: string): Position {
  for (const pair of map.items) {
    if (isPair(pair) && isScalar(pair.key) && pair.key.value === key) return yaml.at(pair.key);
  }
  return yaml.at(map);
}

/** One piece of the text, as YAML's lexer cuts it. */
interface Token {
  /**
   * What sort of piece it is, as `CST.tokenType` names it, such as `map-value-ind` for the colon
   * after a key. The text of a value that is neither quoted nor in brackets is `scalar`.
   */
  type: string;
  /** Where it starts in the text. */
  offset: number;
  source: string;
  /**
   * Only on the `flow-error-end` the lexer puts where a list or a mapping in brackets is cut
   * off: the bracket that opened it.
   */
  opener?: Token;
}

/**
 * Cuts the text into tokens. Of the signals the lexer adds, which are not in the text, only the
 * one for brackets left open is kept, as a token that takes no room.
 */
function tokensOf(text: string): Token[] {
  const found: Token[] = [];
  const open: Token[] = [];
  let offset = 0;
  // The lexer gives a signal before the text of a value. That text is never a comment or a
  // mark, whatever it starts with.
  let inValue = false;
  for (const lexeme of new Lexer().lex(text)) {
    if (lexeme === CST.DOCUMENT) continue;
    if (lexeme === CST.SCALAR) {
      inValue = true;
      continue;
    }
    if (lexeme === CST.FLOW_END) {
      const opener = open[0];
      found.push({ type: 'flow-error-end', offset, source: '', ...(opener ? { opener } : {}) });
      open.length = 0;
      continue;
    }
    const token: Token = { type: inValue ? 'scalar' : (CST.tokenType(lexeme) ?? 'other'), offset, source: lexeme };
    found.push(token);
    if (token.type === 'flow-seq-start' || token.type === 'flow-map-start') open.push(token);
    else if (token.type === 'flow-seq-end' || token.type === 'flow-map-end') open.pop();
    offset += lexeme.length;
    inValue = false;
  }
  return found;
}

/** True for a token that takes up no place of its own on a line: a run of spaces, and the like. */
function isBlank(token: Token): boolean {
  return token.type === 'space' || token.type === 'byte-order-mark' || token.type === 'flow-error-end';
}

/** True for a token after which a new line starts. */
function endsLine(token: Token): boolean {
  return token.type === 'newline' || token.source.endsWith('\n');
}

/** Where a comment stands on its line. */
type CommentPlace = 'line' | 'text' | 'empty' | 'other';

interface Mark {
  type: 'directive' | 'anchor' | 'alias' | 'tag' | 'comment';
  /** Where it starts in the text. */
  offset: number;
  /** How it is written, such as `&shared`, `!!str` or `# a note`. */
  source: string;
  /** Only for a comment: what stands before it on its line. */
  place?: CommentPlace;
}

/** The problem code for each kind of mark. */
const MARK_CODES: Record<Mark['type'], string> = {
  directive: 'yaml-directive',
  anchor: 'yaml-anchor',
  alias: 'yaml-alias',
  tag: 'yaml-tag',
  comment: 'yaml-comment',
};

/** Finds every directive, anchor, alias, tag and comment as it is written in the text. */
function marks(tokens: readonly Token[], empties: readonly number[]): Mark[] {
  const found: Mark[] = [];
  // The last token so far on the line that is not blank.
  let last: Token | undefined;
  for (const token of tokens) {
    const { type, offset, source } = token;
    if (type === 'directive-line') found.push({ type: 'directive', offset, source });
    else if (type === 'anchor' || type === 'alias' || type === 'tag') found.push({ type, offset, source });
    else if (type === 'comment') found.push({ type: 'comment', offset, source, place: commentPlace(last, token, empties) });

    if (endsLine(token)) last = undefined;
    else if (!isBlank(token)) last = token;
  }
  return found;
}

/**
 * What a comment cuts short. After the text of a value it cuts the value; after the colon of a
 * key or the hyphen of an item, with no value below, it leaves the value empty.
 */
function commentPlace(last: Token | undefined, comment: Token, empties: readonly number[]): CommentPlace {
  if (!last) return 'line';
  if (last.type === 'scalar') return 'text';
  if (last.type === 'map-value-ind' || last.type === 'seq-item-ind' || last.type === 'explicit-key-ind') {
    const empty = empties.some((start) => start > last.offset && start <= comment.offset);
    return empty ? 'empty' : 'other';
  }
  return 'other';
}

/** Where each value that is written as nothing at all starts. */
function emptyValues(doc: Document): number[] {
  const found: number[] = [];
  visit(doc, {
    Scalar(_key, node) {
      if (node.value === null && node.range && node.range[0] === node.range[1]) found.push(node.range[0]);
    },
  });
  return found;
}

/** What is wrong with a mark, and what to do about it. */
function markMessage(mark: Mark, what: string, notesIn: string | null): string {
  // A writer who meant text gets the same refusal as one who meant YAML, so each is told both.
  const asText = 'If this is text, put it in double quotes.';
  switch (mark.type) {
    case 'directive':
      return `Directives (${quote(mark.source.split(/\s/)[0] ?? '%')}) are not allowed. Remove this line.`;
    case 'anchor':
      return `Anchors (${quote(mark.source)}) are not allowed. Write the value out where it is used. ${asText}`;
    case 'alias':
      return `Aliases (${quote(mark.source)}) are not allowed. Write the value out. ${asText}`;
    case 'tag':
      return `Tags (${quote(mark.source)}) are not allowed. Write the plain value. ${asText}`;
    case 'comment':
      return commentMessage(mark, what, notesIn);
  }
}

/**
 * Why a comment is refused. Nothing reads a comment, and a `#` after a space cuts a value short
 * without a word, so a file holds none.
 */
function commentMessage(mark: Mark, what: string, notesIn: string | null): string {
  const lost = quote(' ' + cut(mark.source.trimEnd()));
  const none = `${what.charAt(0).toLowerCase()}${what.slice(1)} holds no comments`;
  const remove = notesIn === null ? 'Remove it.' : `Remove it, or say it in ${quote(notesIn)}.`;
  const either = 'If this is part of the text, put the whole text in double quotes. If it is a note, remove it:';
  switch (mark.place) {
    case 'line':
      return `This line is a comment. ${what} holds no comments, since nothing reads them. ${remove}`;
    case 'text':
      return `YAML reads ${lost} as a comment, so the value stops before it. ${either} ${none}.`;
    case 'empty':
      return `YAML reads ${lost} as a comment, so the value is empty. ${either} ${none}.`;
    default:
      return `YAML reads ${lost} as a comment. ${what} holds no comments, since nothing reads them. ${remove}`;
  }
}

/** Text cut short at a word when it is long, so that a message stays short. */
function cut(text: string): string {
  const most = 40;
  const characters = [...text];
  if (characters.length <= most) return text;
  const head = characters.slice(0, most - '...'.length).join('');
  const space = head.lastIndexOf(' ');
  return (space > 0 ? head.slice(0, space) : head) + '...';
}

/** A slip in the YAML, in plain words, at the character that causes it. */
interface Slip {
  offset: number;
  message: string;
  /** False when the parser's complaint is not one this reader can explain. */
  known: boolean;
}

const UNKNOWN_SLIP = 'YAML cannot read this. Check the indent, the quotes and the brackets around this place.';
const TAB_INDENT = 'Indent this line with spaces. A tab cannot set the indent.';
const COLON = 'YAML reads this colon as the start of another key. Put the whole text in double quotes.';
const COLON_BELOW =
  'YAML reads this line as part of the value above it, and this colon as the start of another key. ' +
  'If the line is part of that text, put the whole text in double quotes. If it is a key of its own, start it at the beginning of the line.';
const ENDS_EARLY = 'YAML reads the start of this value as something that ends before the line does. Put the whole text in double quotes.';

/**
 * Says in plain words what each fault the parser found means for the writer. The parser often
 * complains more than once about one slip, always on the line where the slip is, so each line
 * gets one message: the first that can be explained, or else the first.
 */
function slips(faults: readonly YAMLError[], source: string, tokens: readonly Token[], lines: LineCounter): Slip[] {
  const byLine = new Map<number, Slip>();
  for (const fault of faults) {
    const line = lines.linePos(fault.pos[0]).line;
    const slip = explain(fault, source, tokens);
    const kept = byLine.get(line);
    if (!kept || (!kept.known && slip.known)) byLine.set(line, slip);
  }
  return [...byLine.values()];
}

/** One fault of the parser in plain words, moved to the character that causes it. */
function explain(fault: YAMLError, source: string, tokens: readonly Token[]): Slip {
  const at = fault.pos[0];
  const index = tokenAt(tokens, at);
  const token = tokens[index];
  const known = (offset: number, message: string): Slip => ({ offset, message, known: true });

  switch (fault.code) {
    case 'TAB_AS_INDENT':
      return known(tabInIndent(source, at) ?? at, TAB_INDENT);
    case 'BAD_INDENT': {
      const tab = tabInIndent(source, at);
      if (tab !== undefined) return known(tab, TAB_INDENT);
      const opener = openerCutAt(tokens, at);
      if (opener) return known(opener.offset, unclosedBracket(opener.source));
      break;
    }
    case 'BLOCK_AS_IMPLICIT_KEY': {
      if (token?.type === 'explicit-key-ind') return known(token.offset, meaningAtStart('?'));
      if (!token || !isText(token)) break;
      const colon = colonAfter(tokens, index);
      if (!colon) break;
      return known(colon.offset, source.slice(at, colon.offset).includes('\n') ? COLON_BELOW : COLON);
    }
    case 'BAD_SCALAR_START':
      return known(at, reservedStart(source.charAt(at)));
    case 'BAD_ALIAS':
      // An anchor or an alias with no name: `&` or `*` and a space, at the start of a text.
      if (source.charAt(at) === '&' || source.charAt(at) === '*') return known(at, reservedStart(source.charAt(at)));
      break;
    case 'UNEXPECTED_TOKEN': {
      if (!token) break;
      if (token.type === 'block-scalar-header') return known(token.offset, reservedStart(token.source.charAt(0)));
      if (token.type === 'seq-item-ind' && before(tokens, index)?.type === 'map-value-ind') return known(token.offset, meaningAtStart('-'));
      const start = valueStart(tokens, index);
      if (!start || start.offset >= token.offset) break;
      if (start.type === 'block-scalar-header') return known(start.offset, reservedStart(start.source.charAt(0)));
      if (ENDS_BEFORE_THE_LINE.has(start.type)) return known(start.offset, ENDS_EARLY);
      break;
    }
    case 'BAD_DQ_ESCAPE':
      return known(
        at,
        `In double quotes a backslash starts an escape, and ${quote(source.slice(at, at + 2))} is not one YAML knows. ` +
          `To write a backslash, write two: ${quote('\\\\')}.`,
      );
    case 'MISSING_CHAR': {
      const opener = openerCutAt(tokens, at);
      if (opener) return known(opener.offset, unclosedBracket(opener.source));
      const quoted = tokens[tokenAt(tokens, at - 1)];
      if (quoted && isQuoted(quoted) && quoted.offset + quoted.source.length === at) {
        const mark = quoted.source.charAt(0);
        return known(quoted.offset, `This ${quote(mark)} is never closed. Put another ${quote(mark)} at the end of the text.`);
      }
      break;
    }
  }
  return { offset: at, message: UNKNOWN_SLIP, known: false };
}

/** The tokens a value can start with that end before the rest of its line: a quote, a bracket, an alias. */
const ENDS_BEFORE_THE_LINE = new Set(['double-quoted-scalar', 'single-quoted-scalar', 'flow-seq-start', 'flow-map-start', 'alias']);

function isQuoted(token: Token): boolean {
  return token.type === 'double-quoted-scalar' || token.type === 'single-quoted-scalar';
}

/** True for a token that is the text of a value, quoted or not. */
function isText(token: Token): boolean {
  return token.type === 'scalar' || isQuoted(token);
}

/** For a text that starts with a character YAML gives a meaning to, such as `@`. */
function reservedStart(character: string): string {
  const named = character === '`' ? 'a backtick' : quote(character);
  return `This text starts with ${named}, which YAML keeps for itself. Put the whole text in double quotes.`;
}

/** For a text that starts with `- ` or `? `, which YAML reads as an item or a key. */
function meaningAtStart(indicator: string): string {
  return `YAML gives ${quote(indicator + ' ')} a meaning at the start of a value. Put the whole text in double quotes.`;
}

function unclosedBracket(opener: string): string {
  const closer = opener === '[' ? ']' : '}';
  return `This ${quote(opener)} is never closed. Close it with ${quote(closer)}, or, if this is text, put the whole text in double quotes.`;
}

/** The index of the token that holds an offset: the last one that starts at or before it. */
function tokenAt(tokens: readonly Token[], offset: number): number {
  let found = -1;
  for (let index = 0; index < tokens.length && (tokens[index] as Token).offset <= offset; index++) found = index;
  return found;
}

/** The token before another on its line that is not blank, if there is one. */
function before(tokens: readonly Token[], index: number): Token | undefined {
  for (let other = index - 1; other >= 0; other--) {
    const token = tokens[other] as Token;
    if (endsLine(token)) return undefined;
    if (!isBlank(token)) return token;
  }
  return undefined;
}

/**
 * The token a value starts with, for the token at an index inside it: the first one after the
 * `:`, `-`, `?` or `,` before it on its line, passing over anything in brackets.
 */
function valueStart(tokens: readonly Token[], index: number): Token | undefined {
  let start: Token | undefined;
  let depth = 0;
  for (let other = index - 1; other >= 0; other--) {
    const token = tokens[other] as Token;
    if (endsLine(token)) break;
    if (token.type === 'flow-seq-end' || token.type === 'flow-map-end') depth++;
    else if (token.type === 'flow-seq-start' || token.type === 'flow-map-start') {
      if (depth === 0) break;
      depth--;
    } else if (depth === 0 && ['map-value-ind', 'seq-item-ind', 'explicit-key-ind', 'comma'].includes(token.type)) break;
    if (!isBlank(token)) start = token;
  }
  return start;
}

/** The first colon after a key's text that is not inside brackets. */
function colonAfter(tokens: readonly Token[], index: number): Token | undefined {
  let depth = 0;
  for (let other = index + 1; other < tokens.length; other++) {
    const token = tokens[other] as Token;
    if (token.type === 'flow-seq-start' || token.type === 'flow-map-start') depth++;
    else if (token.type === 'flow-seq-end' || token.type === 'flow-map-end') depth--;
    else if (depth === 0 && token.type === 'map-value-ind') return token;
  }
  return undefined;
}

/** The bracket that opened a list or a mapping the lexer had to cut off at an offset. */
function openerCutAt(tokens: readonly Token[], offset: number): Token | undefined {
  return tokens.find((token) => token.type === 'flow-error-end' && token.offset === offset)?.opener;
}

/** The first tab in the indent of the line that holds an offset, if there is one. */
function tabInIndent(source: string, offset: number): number | undefined {
  for (let index = source.lastIndexOf('\n', offset - 1) + 1; source[index] === ' ' || source[index] === '\t'; index++) {
    if (source[index] === '\t') return index;
  }
  return undefined;
}

/** The text of the key that starts at an offset, when there is one. */
function keyStartingAt(doc: Document, offset: number): string | undefined {
  let found: string | undefined;
  visit(doc, {
    Pair(_key, pair) {
      if (isScalar(pair.key) && pair.key.range?.[0] === offset && typeof pair.key.value === 'string') {
        found = pair.key.value;
        return visit.BREAK;
      }
      return undefined;
    },
  });
  return found;
}
