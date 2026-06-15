[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCallToolRetryRequest

# Function: buildCallToolRetryRequest()

> **buildCallToolRetryRequest**(`initialId`, `retryId`, `config`): `objectOutputType`

Defined in: [protocol/tools-call.ts:191](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L191)

Builds a retry `tools/call` request after an `input_required` result, echoing
`requestState` byte-for-byte and supplying `inputResponses`. (§16.5, S17)

The retry's JSON-RPC `id` MUST differ from the initial request's `id`; this
helper enforces that by throwing when `retryId` equals `initialId`. (R-16.5-u)

`requestState` is passed through untouched — this function never derives,
parses, or mutates it, honoring the opaque-blob rule. (R-16.5-i, R-16.5-j)

## Parameters

### initialId

`string` \| `number`

The `id` of the original (now `input_required`) request.

### retryId

`string` \| `number`

The `id` for the retry; MUST differ from `initialId`.

### config

[`CallToolRetryConfig`](../interfaces/CallToolRetryConfig.md)

The tool name, `inputResponses`, echoed `requestState`, `_meta`.

## Returns

`objectOutputType`

## Throws

When `retryId` equals `initialId` (R-16.5-u).
