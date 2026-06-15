[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildReadResourceResult

# Function: buildReadResourceResult()

> **buildReadResourceResult**(`contents`, `hints`, `opts?`): `object` & `object` & `object`

Defined in: [protocol/resources-read.ts:379](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L379)

Builds a `ReadResourceResult` with `resultType: "complete"` and the REQUIRED
caching hints. The `contents` array MUST NOT be used to signal non-existence —
an empty array is rejected here so a server cannot accidentally express
"not found" as an empty result; use [buildResourceNotFoundError](buildResourceNotFoundError.md)
instead. (§17.5, R-17.5-i, R-17.5-q, R-17.5-r, R-17.5-z)

## Parameters

### contents

readonly [`ResourceContents`](../type-aliases/ResourceContents.md)[]

One or more text/binary content entries (MUST be non-empty).

### hints

[`ReadCacheHints`](../interfaces/ReadCacheHints.md)

The REQUIRED `ttlMs` / `cacheScope` caching hints.

### opts?

OPTIONAL `_meta`.

#### _meta?

`Record`\<`string`, `unknown`\>

## Returns

## Throws

When `hints.ttlMs` is negative. (R-17.5-r)

## Throws

When `contents` is empty — non-existence MUST be the
  `-32602` error, never an empty result. (R-17.5-z, R-17.5-aa)
