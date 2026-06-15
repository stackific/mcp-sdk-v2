[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildListResourcesResult

# Function: buildListResourcesResult()

> **buildListResourcesResult**(`resources`, `hints`, `opts?`): `object` & `object` & `object` & `object`

Defined in: [protocol/resources.ts:539](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L539)

Builds a `ListResourcesResult` with `resultType: "complete"` and the REQUIRED
caching hints. `nextCursor` and `_meta` are included only when supplied — they
are never defaulted. (§17.2, R-17.2-b, R-17.2-c, R-17.2-f – R-17.2-i)

## Parameters

### resources

readonly `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[]

The available resources (MAY be empty).

### hints

[`ListCacheHints`](../interfaces/ListCacheHints.md)

The REQUIRED `ttlMs` / `cacheScope` caching hints.

### opts?

OPTIONAL `nextCursor` (omit on the final page) and `_meta`.

#### nextCursor?

`string`

#### _meta?

`Record`\<`string`, `unknown`\>

## Returns

## Throws

When `hints.ttlMs` is negative — caching hints require `≥ 0`.
