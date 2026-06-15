[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildReadResourceRetryParams

# Function: buildReadResourceRetryParams()

> **buildReadResourceRetryParams**(`uri`, `inputRequests`, `inputResponses`, `requestState?`): `objectOutputType`

Defined in: [protocol/resources-read.ts:272](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L272)

Builds the retry params for a `resources/read` that the server answered with
`input_required`. Every key in the server's `inputRequests` MUST be answered
in `inputResponses`; the prior `requestState` (when the server supplied one)
is echoed back BYTE-FOR-BYTE unchanged. (§17.5, R-17.5-e, R-17.5-g, R-17.5-h, R-17.5-x)

## Parameters

### uri

`string`

The same resource URI as the original request.

### inputRequests

`Record`\<`string`, `unknown`\>

The server's earlier `inputRequests` (its key set).

### inputResponses

`Record`\<`string`, `unknown`\>

The client's responses; MUST cover every `inputRequests` key.

### requestState?

`string`

The opaque token from the `input_required` result, if any.

## Returns

`objectOutputType`

## Throws

When `inputResponses` does not answer every `inputRequests` key. (R-17.5-e)
