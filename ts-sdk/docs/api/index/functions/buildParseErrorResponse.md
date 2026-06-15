[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildParseErrorResponse

# Function: buildParseErrorResponse()

> **buildParseErrorResponse**(`options?`): [`MalformedIdErrorResponse`](../interfaces/MalformedIdErrorResponse.md)

Defined in: [transport/correlation.ts:217](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L217)

Builds a parse-error response for a request whose `id` could not be read.
(R-7.2-h)

## Parameters

### options?

#### nullId?

`boolean`

When `true`, the response carries `"id": null`; when
  `false`/omitted, the `id` member is omitted entirely. Both forms are valid.

## Returns

[`MalformedIdErrorResponse`](../interfaces/MalformedIdErrorResponse.md)
