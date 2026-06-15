[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / hasExternalRef

# Function: hasExternalRef()

> **hasExternalRef**(`node`, `maxDepth?`): `boolean`

Defined in: [protocol/tools.ts:212](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L212)

Walks a schema document and returns `true` when any `$ref` / `$dynamicRef`
targets a location OUTSIDE the document (a non-in-document reference). Such a
reference MUST NOT be automatically dereferenced or fetched over network or
file system; only in-document references are resolved. (§16.4(5), R-16.4-f,
R-16.4-g, R-16.4-r)

This is a pure structural inspection: it never performs any I/O, so it cannot
trigger an SSRF fetch — it only reports whether an external `$ref` is present
so callers can reject it (R-16.4-k) rather than dereference it.

## Parameters

### node

`unknown`

The schema (or sub-schema) to inspect.

### maxDepth?

`number` = `DEFAULT_SCHEMA_LIMITS.maxDepth`

Bound on recursion depth so a pathological schema cannot
  exhaust the stack. (R-16.4-l, R-16.4-m)

## Returns

`boolean`
