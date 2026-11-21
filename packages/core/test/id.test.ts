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
    ['a'.repeat(ID_MAX + 1), 'at most 80'],
  ])('refuses %s', (id, reason) => {
    expect(idProblem(id)).toContain(reason);
    expect(isId(id)).toBe(false);
  });
});
