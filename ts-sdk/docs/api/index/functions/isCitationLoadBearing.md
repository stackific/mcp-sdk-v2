[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isCitationLoadBearing

# Function: isCitationLoadBearing()

> **isCitationLoadBearing**(`_citationMarker`): `boolean`

Defined in: [protocol/conformance-requirements.ts:1027](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L1027)

Returns `false` always: no §30 citation marker is ever load-bearing. (R-30-a)
Provided as a predicate so a conformance harness can assert that removing a
citation changes no required behavior — the answer is unconditionally "not
load-bearing", independent of which marker is named.

## Parameters

### \_citationMarker

`string`

## Returns

`boolean`
