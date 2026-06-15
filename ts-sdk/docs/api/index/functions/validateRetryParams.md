[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRetryParams

# Function: validateRetryParams()

> **validateRetryParams**(`inputRequests`, `inputResponses`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `error`: \{ `code`: `-32602`; `message`: `string`; \}; \}

Defined in: [protocol/multi-round-trip.ts:530](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L530)

Validates the server-side retry params and returns a JSON-RPC error payload
when `inputResponses` are malformed at the protocol level. (R-11.5-s)

Returns `{ ok: true }` when all response shapes pass kind-correlation.
Returns `{ ok: false, error }` when any response is mismatched; the server
MUST return this error payload, not another `InputRequiredResult`.

## Parameters

### inputRequests

`Record`\<`string`, [`InputRequest`](../type-aliases/InputRequest.md)\>

The server's original `inputRequests` map.

### inputResponses

`Record`\<`string`, `unknown`\>

The client's retry `inputResponses`.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `error`: \{ `code`: `-32602`; `message`: `string`; \}; \}
