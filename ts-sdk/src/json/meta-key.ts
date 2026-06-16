/**
 * `_meta` key naming validation (§2.6.2).
 *
 * A valid `_meta` key consists of an OPTIONAL prefix followed by a name.
 *
 * Prefix (when present):
 *  - One or more dot-separated labels terminated by a single slash.
 *  - Each label MUST start with a letter and end with a letter or digit.
 *  - Interior characters MAY be letters, digits, or hyphens.
 *  - SHOULD use reverse-DNS notation (e.g. `com.example/`).
 *  - A prefix whose SECOND label is `modelcontextprotocol` or `mcp` is reserved.
 *
 * Name (portion after the prefix, or the whole key when no prefix):
 *  - Unless empty, MUST begin and end with `[a-zA-Z0-9]`.
 *  - Interior characters MAY be alphanumeric, hyphens, underscores, or dots.
 *
 * Reserved bare keys: `traceparent`, `tracestate`, `baggage` (W3C trace context).
 */

/** Labels that make a prefix reserved when they appear as the second label. */
const RESERVED_SECOND_LABELS = new Set(['modelcontextprotocol', 'mcp']);

/** Bare keys reserved for W3C trace-context propagation. (R-2.6.2-i) */
export const TRACE_CONTEXT_KEYS = new Set(['traceparent', 'tracestate', 'baggage']);

/** Tests whether a single prefix label is valid. */
function isValidLabel(label: string): boolean {
  if (label.length === 0) return false;
  if (!/^[a-zA-Z]/.test(label)) return false;
  if (!/[a-zA-Z0-9]$/.test(label)) return false;
  return /^[a-zA-Z][a-zA-Z0-9-]*[a-zA-Z0-9]$|^[a-zA-Z]$/.test(label);
}

/**
 * Returns `true` when `prefix` is a syntactically valid `_meta` key prefix.
 * A prefix is one or more dot-separated labels terminated by a single `/`.
 * (R-2.6.2-b, R-2.6.2-c, R-2.6.2-d, AC-02.17)
 */
export function isValidMetaKeyPrefix(prefix: string): boolean {
  if (!prefix.endsWith('/')) return false;
  const body = prefix.slice(0, -1);
  if (body.length === 0) return false;
  const labels = body.split('.');
  return labels.every(isValidLabel);
}

/**
 * Returns `true` when `prefix` is reserved (its second label is
 * `modelcontextprotocol` or `mcp`). (R-2.6.2-f, AC-02.17)
 *
 * Implementations MUST NOT define `_meta` keys under a reserved prefix
 * except as specified by this document or an MCP-published extension.
 */
export function isReservedMetaKeyPrefix(prefix: string): boolean {
  const body = prefix.endsWith('/') ? prefix.slice(0, -1) : prefix;
  const labels = body.split('.');
  return labels.length >= 2 && RESERVED_SECOND_LABELS.has(labels[1] ?? '');
}

/**
 * Returns `true` when `name` is a valid `_meta` key name.
 * An empty name is valid (when a prefix is present).
 * Non-empty names MUST begin and end with `[a-zA-Z0-9]`; interior
 * characters MAY be alphanumeric, hyphens, underscores, or dots.
 * (R-2.6.2-g, R-2.6.2-h, AC-02.18)
 */
export function isValidMetaKeyName(name: string): boolean {
  if (name === '') return true;
  return /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/.test(name);
}

/** Parsed parts of a `_meta` key. */
export interface ParsedMetaKey {
  prefix: string | undefined;
  name: string;
}

/**
 * Splits a `_meta` key into its prefix (if any) and name.
 * The prefix includes the trailing slash; the name is everything after it.
 */
export function parseMetaKey(key: string): ParsedMetaKey {
  const slash = key.indexOf('/');
  if (slash === -1) return { prefix: undefined, name: key };
  return { prefix: key.slice(0, slash + 1), name: key.slice(slash + 1) };
}

/**
 * Returns `true` when a `_meta` key is syntactically valid and its prefix
 * (if present) is not reserved.
 *
 * Note: reserved bare keys (`traceparent`, `tracestate`, `baggage`) are
 * always valid — they are permitted by the spec. (R-2.6.2-i, R-2.6.2-j)
 */
export function isValidMetaKey(key: string): boolean {
  if (TRACE_CONTEXT_KEYS.has(key)) return true;
  const { prefix, name } = parseMetaKey(key);
  if (prefix !== undefined) {
    if (!isValidMetaKeyPrefix(prefix)) return false;
    if (isReservedMetaKeyPrefix(prefix)) return false;
  }
  return isValidMetaKeyName(name);
}

/**
 * Pattern for a W3C `traceparent` value:
 *   `{version}-{traceId}-{parentId}-{flags}`
 *   00-32hex-16hex-2hex
 * (R-2.6.2-i, AC-02.19)
 */
const TRACEPARENT_RE =
  /^[0-9a-f]{2}-[0-9a-f]{32}-[0-9a-f]{16}-[0-9a-f]{2}$/;

/** Returns `true` when `value` conforms to the W3C `traceparent` format. */
export function isValidTraceparent(value: string): boolean {
  if (!TRACEPARENT_RE.test(value)) return false;
  // W3C Trace Context validity beyond the byte grammar (R-2.6.2-i): version `ff`
  // is reserved/forbidden, and neither the trace-id nor the parent-id may be
  // all-zero (an all-zero id is the "invalid" sentinel, not a usable value).
  const [version, traceId, parentId] = value.split('-');
  if (version === 'ff') return false;
  if (/^0+$/.test(traceId!)) return false;
  if (/^0+$/.test(parentId!)) return false;
  return true;
}

// ─── W3C tracestate grammar (Trace Context Level 2, §3.3) ────────────────────

// Simple key: one lowercase letter followed by 0-255 lowercase/digit/_-*/ chars.
const TRACESTATE_SIMPLE_KEY_RE = /^[a-z][a-z0-9_\-*/]{0,255}$/;

// Multi-tenant key: tenant-id (1-241 chars) + "@" + system-id (1-14 chars).
const TRACESTATE_MULTI_KEY_RE =
  /^[a-z0-9][a-z0-9_\-*/]{0,240}@[a-z][a-z0-9_\-*/]{0,13}$/;

/**
 * chr = %x20 / nblkchar; combined range (all printable ASCII except comma 0x2C
 * and "?" 0x3F): 0x20–0x2B, 0x2D–0x3E, 0x40–0x7E.
 */
const TRACESTATE_CHR_RE = /^[\x20-\x2b\x2d-\x3e\x40-\x7e]+$/;

/** nblkchar (chr minus space): 0x21–0x2B, 0x2D–0x3E, 0x40–0x7E. */
const TRACESTATE_NBLKCHAR_LAST_RE = /[\x21-\x2b\x2d-\x3e\x40-\x7e]$/;

function isValidTracestateKey(key: string): boolean {
  return TRACESTATE_SIMPLE_KEY_RE.test(key) || TRACESTATE_MULTI_KEY_RE.test(key);
}

function isValidTracestateValue(v: string): boolean {
  // value = 0*255(chr) nblkchar → 1–256 chars, last must be nblkchar
  return (
    v.length >= 1 &&
    v.length <= 256 &&
    TRACESTATE_CHR_RE.test(v) &&
    TRACESTATE_NBLKCHAR_LAST_RE.test(v)
  );
}

function isValidTracestateEntry(entry: string): boolean {
  const eq = entry.indexOf('=');
  if (eq <= 0) return false;
  return (
    isValidTracestateKey(entry.slice(0, eq)) &&
    isValidTracestateValue(entry.slice(eq + 1))
  );
}

/**
 * Returns `true` when `value` conforms to the W3C Trace Context tracestate grammar.
 * Each list member must be a `simple-key=value` or `tenant-id@system-id=value` pair;
 * up to 32 members separated by commas. (R-4.2-l, AC-05.15)
 */
export function isValidTracestate(value: string): boolean {
  if (value.length === 0 || value.length > 512) return false;
  const members = value.split(/[ \t]*,[ \t]*/);
  return members.length <= 32 && members.every(isValidTracestateEntry);
}

// ─── W3C Baggage grammar (W3C Baggage spec, §3.3.1) ──────────────────────────

/**
 * RFC 7230 token: one or more tchar.
 * tchar = "!" / "#" / "$" / "%" / "&" / "'" / "*" / "+" / "-" / "." /
 *         "^" / "_" / "`" / "|" / "~" / DIGIT / ALPHA
 */
const BAGGAGE_TOKEN_RE = /^[!#$%&'*+\-.^_`|~a-zA-Z0-9]+$/;

/**
 * Baggage-octet: printable ASCII excluding DQUOTE (0x22), comma (0x2C),
 * semicolon (0x3B), and backslash (0x5C).
 * Ranges: 0x21, 0x23–0x2B, 0x2D–0x3A, 0x3C–0x5B, 0x5D–0x7E.
 */
const BAGGAGE_OCTET_RE = /^[\x21\x23-\x2b\x2d-\x3a\x3c-\x5b\x5d-\x7e]*$/;

function isValidBaggageMember(member: string): boolean {
  const semi = member.indexOf(';');
  const keyVal = semi === -1 ? member : member.slice(0, semi);
  const propStr = semi === -1 ? '' : member.slice(semi + 1);

  const eq = keyVal.indexOf('=');
  if (eq <= 0) return false;
  if (!BAGGAGE_TOKEN_RE.test(keyVal.slice(0, eq))) return false;
  if (!BAGGAGE_OCTET_RE.test(keyVal.slice(eq + 1))) return false;

  if (propStr) {
    for (const prop of propStr.split(';')) {
      const t = prop.trim();
      if (!t) return false;
      const pEq = t.indexOf('=');
      if (pEq === -1) {
        if (!BAGGAGE_TOKEN_RE.test(t)) return false;
      } else {
        if (!BAGGAGE_TOKEN_RE.test(t.slice(0, pEq))) return false;
        if (!BAGGAGE_OCTET_RE.test(t.slice(pEq + 1))) return false;
      }
    }
  }

  return true;
}

/**
 * Returns `true` when `value` conforms to the W3C Baggage grammar.
 * Each list member must be `token "=" *baggage-octet` with optional properties.
 * (R-4.2-m, AC-05.15)
 */
export function isValidBaggage(value: string): boolean {
  if (value.length === 0) return false;
  const members = value.split(/[ \t]*,[ \t]*/);
  return members.every(isValidBaggageMember);
}

/**
 * Returns `true` when `value` is a valid W3C `tracestate` or `baggage` value.
 * Accepts if either `isValidTracestate` or `isValidBaggage` passes. (R-2.6.2-i)
 */
export function isValidTraceContextValue(value: string): boolean {
  return isValidTracestate(value) || isValidBaggage(value);
}
