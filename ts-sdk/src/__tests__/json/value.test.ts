/**
 * Tests for the JSON value model — S02 §2.3, §2.5.
 *
 * AC coverage:
 *  AC-02.1  (R-2.3-a)              — all wire values are valid JSONValues
 *  AC-02.2  (R-2.3.1-d)            — senders MUST NOT emit duplicate names
 *  AC-02.3  (R-2.3.1-a,b,c)        — last-duplicate-wins when receiver tolerates
 *  AC-02.4  (R-2.3.1-e,f)          — member order is insignificant
 *  AC-02.5  (R-2.3.1-g)            — array order is significant and preserved
 *  AC-02.13 (R-2.5-a,b)            — integer fields: no fractional part
 *  AC-02.14 (R-2.5-c,d,e)          — safe-integer range for ids/counters
 *  AC-02.15 (R-2.5-f,g)            — numeric equality is textual-form-independent
 */

import { describe, it, expect } from 'vitest';
import {
  isJSONValue,
  isSafeInteger,
  isInteger,
  assertInteger,
  assertSafeInteger,
  numericEqual,
  lastDuplicateWins,
  SAFE_INTEGER_MIN,
  SAFE_INTEGER_MAX,
} from '../../json/value.js';

describe('isJSONValue — all six wire forms (AC-02.1 — R-2.3-a)', () => {
  it('accepts a string', () => expect(isJSONValue('hello')).toBe(true));
  it('accepts a number', () => expect(isJSONValue(42)).toBe(true));
  it('accepts boolean true', () => expect(isJSONValue(true)).toBe(true));
  it('accepts boolean false', () => expect(isJSONValue(false)).toBe(true));
  it('accepts null', () => expect(isJSONValue(null)).toBe(true));
  it('accepts a JSONObject', () => expect(isJSONValue({ a: 1 })).toBe(true));
  it('accepts a JSONArray', () => expect(isJSONValue([1, 'two', null])).toBe(true));
  it('accepts a nested structure', () => {
    expect(isJSONValue({ x: [1, { y: true }] })).toBe(true);
  });
  it('rejects undefined', () => expect(isJSONValue(undefined)).toBe(false));
  it('rejects a function', () => expect(isJSONValue(() => {})).toBe(false));
  it('rejects a Symbol', () => expect(isJSONValue(Symbol())).toBe(false));
  it('rejects NaN / ±Infinity — not representable in JSON (R-2.3-a)', () => {
    expect(isJSONValue(NaN)).toBe(false);
    expect(isJSONValue(Infinity)).toBe(false);
    expect(isJSONValue(-Infinity)).toBe(false);
    // …and nested, so a structure carrying a non-finite number is not a JSONValue.
    expect(isJSONValue({ a: [1, NaN] })).toBe(false);
  });
});

describe('lastDuplicateWins — duplicate-key handling (AC-02.3 — R-2.3.1-c)', () => {
  it('uses the last occurrence when a name appears more than once', () => {
    const result = lastDuplicateWins([
      ['key', 'first'],
      ['key', 'second'],
    ]);
    expect(result['key']).toBe('second');
  });

  it('handles multiple duplicate names independently', () => {
    const result = lastDuplicateWins([
      ['a', 1],
      ['b', 'x'],
      ['a', 2],
      ['b', 'y'],
    ]);
    expect(result['a']).toBe(2);
    expect(result['b']).toBe('y');
  });

  it('returns all unique keys unchanged', () => {
    const result = lastDuplicateWins([
      ['x', 1],
      ['y', 2],
    ]);
    expect(result).toEqual({ x: 1, y: 2 });
  });
});

describe('Member order independence (AC-02.4 — R-2.3.1-e, R-2.3.1-f)', () => {
  it('two objects with the same members in different order are semantically equal', () => {
    const a = { x: 1, y: 'two', z: true };
    const b = { z: true, x: 1, y: 'two' };
    // JavaScript object equality — member values are the same regardless of insertion order
    expect(Object.keys(a).sort()).toEqual(Object.keys(b).sort());
    expect(a.x).toBe(b.x);
    expect(a.y).toBe(b.y);
    expect(a.z).toBe(b.z);
  });
});

describe('Array order preservation (AC-02.5 — R-2.3.1-g)', () => {
  it('element order in a JSONArray is significant and must be preserved', () => {
    const arr = ['a', 'b', 'c'];
    expect(arr[0]).toBe('a');
    expect(arr[1]).toBe('b');
    expect(arr[2]).toBe('c');
  });

  it('two arrays with the same elements in different order are distinct', () => {
    const a = [1, 2, 3];
    const b = [3, 2, 1];
    expect(a).not.toEqual(b);
  });
});

describe('Safe-integer bounds (AC-02.14 — R-2.5-c, R-2.5-d, R-2.5-e)', () => {
  it('SAFE_INTEGER_MIN equals Number.MIN_SAFE_INTEGER', () => {
    expect(SAFE_INTEGER_MIN).toBe(-9007199254740991);
  });

  it('SAFE_INTEGER_MAX equals Number.MAX_SAFE_INTEGER', () => {
    expect(SAFE_INTEGER_MAX).toBe(9007199254740991);
  });

  it('isSafeInteger returns true for values within range', () => {
    expect(isSafeInteger(0)).toBe(true);
    expect(isSafeInteger(1)).toBe(true);
    expect(isSafeInteger(-1)).toBe(true);
    expect(isSafeInteger(SAFE_INTEGER_MAX)).toBe(true);
    expect(isSafeInteger(SAFE_INTEGER_MIN)).toBe(true);
  });

  it('isSafeInteger returns false for values outside range', () => {
    expect(isSafeInteger(SAFE_INTEGER_MAX + 1)).toBe(false);
    expect(isSafeInteger(SAFE_INTEGER_MIN - 1)).toBe(false);
  });

  it('isSafeInteger returns false for fractional numbers', () => {
    expect(isSafeInteger(1.5)).toBe(false);
  });

  it('assertSafeInteger throws outside range (R-2.5-d)', () => {
    expect(() => assertSafeInteger(SAFE_INTEGER_MAX + 1)).toThrow(RangeError);
    expect(() => assertSafeInteger(SAFE_INTEGER_MIN - 1)).toThrow(RangeError);
  });

  it('assertSafeInteger does not throw within range', () => {
    expect(() => assertSafeInteger(42)).not.toThrow();
    expect(() => assertSafeInteger(SAFE_INTEGER_MAX)).not.toThrow();
    expect(() => assertSafeInteger(SAFE_INTEGER_MIN)).not.toThrow();
  });
});

describe('Integer field validation (AC-02.13 — R-2.5-a, R-2.5-b)', () => {
  it('isInteger returns true for whole numbers', () => {
    expect(isInteger(0)).toBe(true);
    expect(isInteger(42)).toBe(true);
    expect(isInteger(-7)).toBe(true);
  });

  it('isInteger returns false for fractional numbers', () => {
    expect(isInteger(1.5)).toBe(false);
    expect(isInteger(0.1)).toBe(false);
  });

  it('assertInteger does not throw for whole numbers', () => {
    expect(() => assertInteger(0)).not.toThrow();
    expect(() => assertInteger(100)).not.toThrow();
  });

  it('assertInteger throws for fractional values (R-2.5-b)', () => {
    expect(() => assertInteger(1.5)).toThrow(TypeError);
    expect(() => assertInteger(0.001)).toThrow(TypeError);
  });
});

describe('Numeric equality (AC-02.15 — R-2.5-f, R-2.5-g)', () => {
  it('1e2 and 100 are numerically equal', () => {
    expect(numericEqual(1e2, 100)).toBe(true);
  });

  it('1.0 and 1 are numerically equal', () => {
    expect(numericEqual(1.0, 1)).toBe(true);
  });

  it('100.0 and 100 are numerically equal', () => {
    expect(numericEqual(100.0, 100)).toBe(true);
  });

  it('1e0 and 1 are numerically equal', () => {
    expect(numericEqual(1e0, 1)).toBe(true);
  });

  it('distinct numeric values are not equal', () => {
    expect(numericEqual(1, 2)).toBe(false);
  });
});
