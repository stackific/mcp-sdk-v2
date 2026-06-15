[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / clientSupportsInputRequestKind

# Function: clientSupportsInputRequestKind()

> **clientSupportsInputRequestKind**(`method`, `clientCapabilities`): `boolean`

Defined in: [protocol/multi-round-trip.ts:596](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L596)

Returns `true` when the client declared support for the capability an
input-request `method` requires. Used BOTH server-side — to decide whether the
server MAY emit a kind (R-11.2-j / R-11.5-g) — and client-side — to verify a
kind before fulfilling it (R-11.5-a). An unrecognized method is never supported.

## Parameters

### method

`string`

The input-request method (e.g. `"elicitation/create"`).

### clientCapabilities

`Record`\<`string`, `unknown`\>

The client's declared capabilities.

## Returns

`boolean`
