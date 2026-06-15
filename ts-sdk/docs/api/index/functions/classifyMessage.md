[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyMessage

# Function: classifyMessage()

> **classifyMessage**(`raw`): [`ClassifiedMessage`](../type-aliases/ClassifiedMessage.md)

Defined in: [jsonrpc/framing.ts:207](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L207)

Classifies a raw incoming value as a `JSONRPCMessage` or throws
`MalformedMessageError`.

Classification algorithm (§3.1 informative):
 - `id` + `method`  → request
 - `method`, no `id` → notification
 - `id` + `result`  → success response
 - `error` (±`id`)  → error response

Rejects (throws):
 - Top-level JSON arrays (batches) — R-3.1-b, R-3.1-c
 - Missing or incorrect `jsonrpc` — R-3.1-d, R-3.1-e
 - Contradictory member combinations — R-3.1-f
 - Unclassifiable member combinations

## Parameters

### raw

`unknown`

## Returns

[`ClassifiedMessage`](../type-aliases/ClassifiedMessage.md)

## Throws
