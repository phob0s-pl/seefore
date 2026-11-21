import { CST, Lexer, LineCounter, isMap, isNode, isPair, isScalar, parseAllDocuments, visit } from 'yaml';
import type { Document, YAMLMap } from 'yaml';
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

/**
 * Reads one YAML file under seefore's rules: YAML 1.2 with its core types, one document, a
 * mapping at the top, text keys, no directives, anchors, aliases or tags, and no key twice.
 *
 * `what` names the kind of file for messages, as in "The marker file" or "A record".
 */
export function readYaml(file: string, text: string, what: string): YamlFile {
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

  for (const fault of doc.errors) {
    const where = atOffset(fault.pos[0]);
    if (fault.code === 'DUPLICATE_KEY') {
      const key = keyStartingAt(doc, fault.pos[0]);
      const named = key === undefined ? 'A key' : `The key ${quote(key)}`;
      problems.push(error(file, where, 'yaml-key-twice', `${named} is written twice in one mapping. Keep one.`));
    } else {
      problems.push(error(file, where, 'yaml-syntax', `This is not YAML that can be read: ${sentence(fault.message)}`));
    }
  }
  if (problems.length > 0) return broken();

  // Directives, anchors, aliases and tags are found in the text itself, so each is reported
  // exactly where it is written.
  for (const mark of marks(source)) {
    const where = atOffset(mark.offset);
    switch (mark.type) {
      case 'directive':
        problems.push(error(file, where, 'yaml-directive', `Directives (${quote(mark.source.split(/\s/)[0] ?? '%')}) are not allowed. Remove this line.`));
        break;
      case 'anchor':
        problems.push(error(file, where, 'yaml-anchor', `Anchors (${quote(mark.source)}) are not allowed. Write the value out where it is used.`));
        break;
      case 'alias':
        problems.push(error(file, where, 'yaml-alias', `Aliases (${quote(mark.source)}) are not allowed. Write the value out.`));
        break;
      case 'tag':
        problems.push(error(file, where, 'yaml-tag', `Tags (${quote(mark.source)}) are not allowed. Write the plain value.`));
        break;
    }
  }
  if (problems.length > 0) return broken();

  // Anything else the parser was unsure about is a fault here: a file is read fully or not at all.
  for (const doubt of doc.warnings) {
    problems.push(error(file, atOffset(doubt.pos[0]), 'yaml-syntax', `This is not YAML that can be read: ${sentence(doubt.message)}`));
  }
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

interface Mark {
  type: 'directive' | 'anchor' | 'alias' | 'tag';
  /** Where it starts in the text. */
  offset: number;
  /** How it is written, such as `&shared` or `!!str`. */
  source: string;
}

/** Finds every directive, anchor, alias and tag as it is written in the text. */
function marks(text: string): Mark[] {
  const found: Mark[] = [];
  let offset = 0;
  for (const lexeme of new Lexer().lex(text)) {
    // The lexer adds three signals of its own that are not in the text.
    if (lexeme === CST.DOCUMENT || lexeme === CST.FLOW_END || lexeme === CST.SCALAR) continue;
    const type = CST.tokenType(lexeme);
    if (type === 'directive-line') found.push({ type: 'directive', offset, source: lexeme });
    else if (type === 'anchor' || type === 'alias' || type === 'tag') found.push({ type, offset, source: lexeme });
    offset += lexeme.length;
  }
  return found;
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

/** Makes the parser's message end like a sentence. */
function sentence(message: string): string {
  const trimmed = message.trim();
  if (trimmed === '') return 'the file could not be parsed.';
  const lower = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
  return /[.!?]$/.test(lower) ? lower : lower + '.';
}
