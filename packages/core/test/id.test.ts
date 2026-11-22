import { describe, expect, it } from 'vitest';
import { ID_MAX, idProblem, isId } from '../src/id.ts';

describe('an id', () => {
  it.each(['a', 'orders', 'order-events', 'api2', 'shop-api-v2', 'x1-y2-z3', 'on', 'yes', 'no', 'console', 'com10', 'a'.repeat(ID_MAX)])('accepts %s', (id) => {
    expect(idProblem(id)).toBeUndefined();
    expect(isId(id)).toBe(true);
  });

  it.each([
    ['', 'cannot be empty'],
    ['Orders', 'written in lowercase'],
    ['orderEvents', '`order-events`'],
    ['order_events', 'is not an id'],
    ['order--events', 'is not an id'],
    ['-orders', 'is not an id'],
    ['orders-', 'is not an id'],
    ['2fast', 'is not an id'],
    ['order events', 'is not an id'],
    ['zamówienia', 'is not an id'],
    ['a.b', 'is not an id'],
    ['true', 'YAML reads it'],
    ['false', 'YAML reads it'],
    ['null', 'YAML reads it'],
    ['con', 'Windows cannot hold a file of that name'],
    ['nul', 'Windows cannot hold'],
    ['aux', 'Windows cannot hold'],
    ['prn', 'Windows cannot hold'],
    ['com1', 'Windows cannot hold'],
    ['lpt9', 'Windows cannot hold'],
    ['seefore', 'a file named `seefore.yaml` marks a source directory'],
    ['a'.repeat(ID_MAX + 1), 'at most 80'],
  ])('refuses %s', (id, reason) => {
    expect(idProblem(id)).toContain(reason);
    expect(isId(id)).toBe(false);
  });

  it('refuses `seefore`, and says why', () => {
    expect(idProblem('seefore')).toBe('`seefore` cannot be an id, because a file named `seefore.yaml` marks a source directory.');
  });

  it('counts its length in characters, as every limit on text does', () => {
    expect(idProblem('🛒'.repeat(ID_MAX + 1))).toBe(`This id has ${ID_MAX + 1} characters. An id has at most ${ID_MAX}.`);
    // Under the limit, what is wrong is the letters it is made of.
    expect(idProblem('🛒'.repeat(41))).toContain('is not an id. An id is lowercase letters and digits in groups joined by single hyphens');
  });

  it('never offers as an example an id that is itself not allowed', () => {
    expect(idProblem('Con')).toBe('`Con` is not an id: an id is written in lowercase, like `order-events`.');
    expect(idProblem('Seefore')).toBe('`Seefore` is not an id: an id is written in lowercase, like `order-events`.');
    expect(idProblem('True')).toBe('`True` is not an id: an id is written in lowercase, like `order-events`.');
  });

  it('starts with the candidate in backticks, or with what the caller names it', () => {
    expect(idProblem('GoLang')).toBe('`GoLang` is not an id: an id is written in lowercase, like `go-lang`.');
    expect(idProblem('GoLang', 'The second id in `technology`, `GoLang`,')).toBe(
      'The second id in `technology`, `GoLang`, is not an id: an id is written in lowercase, like `go-lang`.',
    );
    expect(idProblem('con', 'The first id in `technology`, `con`,')).toBe(
      'The first id in `technology`, `con`, cannot be an id, because Windows cannot hold a file of that name.',
    );
  });
});
