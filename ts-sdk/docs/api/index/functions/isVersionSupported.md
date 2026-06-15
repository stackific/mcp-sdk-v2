[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isVersionSupported

# Function: isVersionSupported()

> **isVersionSupported**(`supportedVersions`, `requested`): `boolean`

Defined in: [protocol/discovery.ts:232](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L232)

Returns `true` when `requested` is one of the server's `supportedVersions`.

Comparison is exact string membership (no lexical/chronological ordering, per
S07/§5.1) and is independent of element order — reordering `supportedVersions`
never changes the outcome.

## Parameters

### supportedVersions

readonly `string`[]

### requested

`string`

## Returns

`boolean`
