[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRequestMeta

# Function: validateRequestMeta()

> **validateRequestMeta**(`meta`): [`RequestMetaValidationResult`](../type-aliases/RequestMetaValidationResult.md)

Defined in: [protocol/meta.ts:241](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L241)

Validates that a request's `_meta` object contains all three REQUIRED
per-request keys. (§4.3, R-4.3-n)

Returns `{ ok: false, code: -32602, message }` when any required key is
missing or has the wrong type; the server MUST respond with this code (and
HTTP `400 Bad Request` on the HTTP transport).

Unknown extra keys are ignored per R-4.1-e, R-4.1-f.

## Parameters

### meta

`Record`\<`string`, `unknown`\>

The raw `_meta` value from the request's `params`.

## Returns

[`RequestMetaValidationResult`](../type-aliases/RequestMetaValidationResult.md)
