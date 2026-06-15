[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / idEchoMatches

# Function: idEchoMatches()

> **idEchoMatches**(`requestId`, `responseId`): `boolean`

Defined in: [jsonrpc/framing.ts:275](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L275)

Returns `true` when `responseId` is a correct echo of `requestId` — same
JSON type (string ↔ string, number ↔ number) and same value. Type coercion
MUST NOT be applied. (R-3.2-e, R-3.2-f, R-3.2-g)

## Parameters

### requestId

`string` \| `number`

### responseId

`string` \| `number`

## Returns

`boolean`
