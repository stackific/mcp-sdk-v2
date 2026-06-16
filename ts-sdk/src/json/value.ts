/**
 * JSONValue — the single wire value model for MCP (§2.3).
 *
 * Every value that crosses the wire is exactly one of six JSON forms.
 * The type is recursive: JSONObject and JSONArray nest JSONValues, forming
 * the foundation all later protocol shapes build on.
 *
 * Numeric bounds (§2.5): identifiers and counters (request ids, error codes,
 * progress counters, pagination counters) MUST stay within the IEEE 754
 * safe-integer range −9007199254740991 to 9007199254740991.
 */

/** The universal wire value — exactly one of the six JSON primitive forms. */
export type JSONValue =
  | string
  | number
  | boolean
  | null
  | JSONObject
  | JSONArray;

/** An unordered, string-keyed map of JSONValues (§2.3.1). */
export type JSONObject = { [key: string]: JSONValue };

/** An ordered sequence of JSONValues; position is significant (§2.3.1). */
export type JSONArray = JSONValue[];

/** Inclusive lower bound for safe identifiers and counters (§2.5, R-2.5-c). */
export const SAFE_INTEGER_MIN = Number.MIN_SAFE_INTEGER; // −9007199254740991

/** Inclusive upper bound for safe identifiers and counters (§2.5, R-2.5-c). */
export const SAFE_INTEGER_MAX = Number.MAX_SAFE_INTEGER; //  9007199254740991

/**
 * Returns `true` when `n` is a safe integer: no fractional part and within
 * the safe-integer range. (R-2.5-c, R-2.5-e, AC-02.14)
 */
export function isSafeInteger(n: number): boolean {
  return Number.isSafeInteger(n);
}

/**
 * Returns `true` when `n` has no fractional part (may be outside safe range).
 * Used to validate integer-typed fields. (R-2.5-a, R-2.5-b, AC-02.13)
 */
export function isInteger(n: number): boolean {
  return Number.isFinite(n) && Math.floor(n) === n;
}

/**
 * Asserts that `n` has no fractional part. Throws when a fractional value
 * is supplied where an integer field is required. (R-2.5-b, AC-02.13)
 */
export function assertInteger(n: number): void {
  if (!isInteger(n)) {
    throw new TypeError(`Expected integer, got ${n}`);
  }
}

/**
 * Asserts that `n` is within the safe-integer range.
 * Senders MUST NOT emit identifier/counter values outside this range. (R-2.5-d)
 */
export function assertSafeInteger(n: number): void {
  if (!Number.isSafeInteger(n)) {
    throw new RangeError(
      `Value ${n} is outside the safe-integer range [${SAFE_INTEGER_MIN}, ${SAFE_INTEGER_MAX}]`,
    );
  }
}

/**
 * Returns `true` when `a` and `b` are numerically equal, regardless of their
 * textual JSON representation (e.g. `100 === 1e2`, `1 === 1.0`).
 * Two numerically equal JSON numbers MUST be treated as equal. (R-2.5-g, AC-02.15)
 */
export function numericEqual(a: number, b: number): boolean {
  return a === b;
}

/**
 * Produces an object from an array of [name, value] pairs, applying the
 * last-duplicate-wins rule (§2.3.1, R-2.3.1-c, AC-02.3).
 *
 * When a receiver does not reject an object with duplicate member names as
 * malformed, it MUST behave as though only the last occurrence is present.
 * This function makes that behaviour explicit and testable.
 */
export function lastDuplicateWins(
  entries: ReadonlyArray<readonly [string, JSONValue]>,
): JSONObject {
  const result: JSONObject = {};
  for (const [key, value] of entries) {
    result[key] = value;
  }
  return result;
}

/**
 * Returns `true` when `value` is a valid JSONValue (one of the six forms).
 * Useful for runtime guards at system boundaries. (R-2.3-a, AC-02.1)
 */
export function isJSONValue(value: unknown): value is JSONValue {
  if (value === null) return true;
  switch (typeof value) {
    case 'string':
    case 'boolean':
      return true;
    case 'number':
      // NaN and ±Infinity are not representable in JSON and are NOT JSONValues —
      // `JSON.stringify` emits them as `null`, so they can never round-trip. (R-2.3-a)
      return Number.isFinite(value);
    case 'object':
      if (Array.isArray(value)) {
        return value.every(isJSONValue);
      }
      return Object.values(value as Record<string, unknown>).every(isJSONValue);
    default:
      return false;
  }
}
