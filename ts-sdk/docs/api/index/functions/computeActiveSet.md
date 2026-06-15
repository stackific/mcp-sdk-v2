[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / computeActiveSet

# Function: computeActiveSet()

> **computeActiveSet**(`clientExtensions`, `serverExtensions`): `string`[]

Defined in: [protocol/extension-mechanism.ts:416](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L416)

Computes the active set for an interaction: the intersection of the client's
and the server's advertised `extensions` maps. (R-24.3-d)

This is a thin, intention-revealing wrapper over S11's
[intersectExtensions](intersectExtensions.md): each side's raw map is normalized (so `null` /
malformed entries (R-24.3-c) and unrecognized one-sided identifiers (R-24.7-g)
fall outside the intersection), and the result is a deterministic, sorted
array. An empty or absent map on either side yields an empty active set
(R-24.3-a).

## Parameters

### clientExtensions

`unknown`

The client's advertised `extensions` map (raw).

### serverExtensions

`unknown`

The server's advertised `extensions` map (raw).

## Returns

`string`[]
