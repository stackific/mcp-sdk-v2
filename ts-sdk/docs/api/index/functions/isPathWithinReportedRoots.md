[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isPathWithinReportedRoots

# Function: isPathWithinReportedRoots()

> **isPathWithinReportedRoots**(`derivedUri`, `reportedRoots`): `boolean`

Defined in: [protocol/roots.ts:565](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L565)

Validates a server-derived filesystem path against the reported roots, so the
server does NOT rely on protocol-level enforcement. (R-21.1.5-k · SHOULD,
R-21.1.5-l · MUST NOT; AC-32.18)

Returns `true` only when `derivedUri` is a valid `file://` URI whose path is
contained within (equal to, or a descendant of) at least one reported root's
path. A path outside every reported root returns `false`; the server SHOULD
act on this rather than assume the protocol blocked it.

Containment compares decoded path segments (so `/a/b` contains `/a/b/c` but
not `/a/bc`); roots whose own `uri` is invalid are skipped.

## Parameters

### derivedUri

`unknown`

The `file://` URI the server derived from the request.

### reportedRoots

readonly `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>[]

The roots the client reported in its `ListRootsResult`.

## Returns

`boolean`
