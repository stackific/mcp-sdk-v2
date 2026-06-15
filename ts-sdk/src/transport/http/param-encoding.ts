/**
 * S14 — `Mcp-Param-*` value encoding (§9.5.3).
 *
 * A client MUST encode each parameter value before placing it in a header, to
 * ensure safe transmission and prevent injection. The per-type string form is:
 *   - `string`  → as-is
 *   - `integer` → its decimal string (`42`, `-7`)
 *   - `boolean` → lowercase `true` / `false`
 *
 * When that string cannot be carried safely as a plain ASCII header value — it
 * has non-ASCII or control characters, leading/trailing whitespace, or it
 * itself looks like the sentinel — the client Base64-encodes the UTF-8 bytes and
 * wraps the result as `=?base64?{payload}?=` (lowercase, exact). A receiver
 * detects the sentinel and decodes it before use.
 */

/** The exact (lowercase) sentinel prefix. (R-9.5.3-c) */
export const BASE64_SENTINEL_PREFIX = '=?base64?';
/** The exact (lowercase) sentinel suffix. (R-9.5.3-c) */
export const BASE64_SENTINEL_SUFFIX = '?=';

/** The widest integer that may safely carry the `x-mcp-header` annotation. (R-9.5.1-g) */
export const MAX_SAFE_ANNOTATED_INTEGER = 2 ** 53 - 1;
/** The smallest integer that may safely carry the `x-mcp-header` annotation. (R-9.5.1-g) */
export const MIN_SAFE_ANNOTATED_INTEGER = -(2 ** 53) + 1;

/** Returns `true` when `value` is an integer within the safe annotated range. (R-9.5.1-g) */
export function isAnnotatedIntegerInRange(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= MIN_SAFE_ANNOTATED_INTEGER &&
    value <= MAX_SAFE_ANNOTATED_INTEGER
  );
}

/**
 * Returns the per-type plain string form of a parameter value. (R-9.5.3-a)
 *
 * @throws {RangeError} When `value` is an integer outside the safe range. (R-9.5.1-g)
 */
export function plainStringForm(value: string | number | boolean): string {
  if (typeof value === 'boolean') {
    return value ? 'true' : 'false';
  }
  if (typeof value === 'number') {
    if (!isAnnotatedIntegerInRange(value)) {
      throw new RangeError(`annotated integer ${value} is outside the safe range`);
    }
    return String(value);
  }
  return value;
}

/** Returns `true` when `headerValue` is wrapped in the Base64 sentinel. */
export function isSentinelEncoded(headerValue: string): boolean {
  return (
    headerValue.startsWith(BASE64_SENTINEL_PREFIX) &&
    headerValue.endsWith(BASE64_SENTINEL_SUFFIX) &&
    headerValue.length >= BASE64_SENTINEL_PREFIX.length + BASE64_SENTINEL_SUFFIX.length
  );
}

/**
 * Returns `true` when `plain` cannot be safely carried as a plain ASCII header
 * value and so MUST be sentinel-encoded. (R-9.5.3-b, R-9.5.3-e)
 *
 * Unsafe when it contains non-ASCII or control characters, has leading or
 * trailing whitespace, or already matches the sentinel shape (to avoid
 * ambiguity). Safe ASCII is visible ASCII `0x21`–`0x7E`, space `0x20`, and
 * horizontal tab `0x09`, with no leading/trailing whitespace.
 */
export function needsSentinel(plain: string): boolean {
  if (isSentinelEncoded(plain)) {
    return true; // a value that itself looks like a sentinel (R-9.5.3-e)
  }
  if (/^\s|\s$/.test(plain)) {
    return true; // leading/trailing whitespace
  }
  for (const ch of plain) {
    const c = ch.codePointAt(0)!;
    const safe = c === 0x09 || (c >= 0x20 && c <= 0x7e);
    if (!safe) {
      return true; // non-ASCII or control character
    }
  }
  return false;
}

/** Wraps the UTF-8 Base64 of `text` in the sentinel form. (R-9.5.3-b, R-9.5.3-c) */
export function sentinelEncode(text: string): string {
  const payload = Buffer.from(text, 'utf8').toString('base64');
  return `${BASE64_SENTINEL_PREFIX}${payload}${BASE64_SENTINEL_SUFFIX}`;
}

/**
 * Encodes a parameter value into its header-value form. (§9.5.3)
 *
 * Returns the plain per-type string when it is safe ASCII; otherwise the
 * `=?base64?{payload}?=` sentinel form. (R-9.5.3-a, R-9.5.3-b, R-9.5.3-e)
 *
 * @throws {RangeError} When `value` is an out-of-range annotated integer.
 */
export function encodeHeaderValue(value: string | number | boolean): string {
  const plain = plainStringForm(value);
  return needsSentinel(plain) ? sentinelEncode(plain) : plain;
}

/**
 * Decodes a header value back to its string form, decoding the Base64 payload
 * first when the sentinel is present. (R-9.5.3-d)
 */
export function decodeHeaderValue(headerValue: string): string {
  if (!isSentinelEncoded(headerValue)) {
    return headerValue;
  }
  const payload = headerValue.slice(
    BASE64_SENTINEL_PREFIX.length,
    headerValue.length - BASE64_SENTINEL_SUFFIX.length,
  );
  return Buffer.from(payload, 'base64').toString('utf8');
}
