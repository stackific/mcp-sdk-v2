[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / intersectExtensions

# Function: intersectExtensions()

> **intersectExtensions**(`clientExtensions`, `serverExtensions`): `string`[]

Defined in: [protocol/extensions.ts:288](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L288)

Returns the set of extension identifiers ACTIVE for an interaction: those
advertised (validly) by BOTH peers — the intersection of the two maps.
(R-6.5-l)

Each raw map is normalized first, so `null`/malformed entries on either side
(R-6.5-j) and unknown keys that the other side does not advertise (R-6.6-d)
naturally fall outside the intersection. The result is a sorted array for
deterministic output.

## Parameters

### clientExtensions

`unknown`

The client's advertised `extensions` map (raw).

### serverExtensions

`unknown`

The server's advertised `extensions` map (raw).

## Returns

`string`[]
