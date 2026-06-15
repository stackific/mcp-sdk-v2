[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateSamplingRequest

# Function: validateSamplingRequest()

> **validateSamplingRequest**(`clientCaps`, `rawParams`): \{ `ok`: `true`; `params`: [`CreateMessageRequestParams`](../interfaces/CreateMessageRequestParams.md); \} \| \{ `ok`: `false`; `error`: \{ `code`: `-32602`; `message`: `string`; \}; \}

Defined in: [protocol/sampling.ts:612](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L612)

Full client-side validation of an inbound sampling request: structural parse
plus the tool-use capability gate. (R-21.2.4-a, R-21.2.4-h, R-21.2.3-b,
R-21.2.4-n, R-21.2.4-o)

Returns `{ ok: true, params }` with the parsed params, or `{ ok: false, error }`
carrying the JSON-RPC error. A request missing `messages` or `maxTokens` is
rejected as malformed (R-21.2.4-a, R-21.2.4-h → AC-33.5); a tool-enabled
request without `sampling.tools` is rejected per the gate.

## Parameters

### clientCaps

`Record`\<`string`, `unknown`\>

The client's declared `ClientCapabilities`.

### rawParams

`unknown`

The raw `params` object from the sampling input request.

## Returns

\{ `ok`: `true`; `params`: [`CreateMessageRequestParams`](../interfaces/CreateMessageRequestParams.md); \} \| \{ `ok`: `false`; `error`: \{ `code`: `-32602`; `message`: `string`; \}; \}
