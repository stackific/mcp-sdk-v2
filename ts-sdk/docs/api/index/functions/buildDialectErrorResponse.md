[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildDialectErrorResponse

# Function: buildDialectErrorResponse()

> **buildDialectErrorResponse**(`id`, `code`, `message?`, `data?`): [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)

Defined in: [protocol/ui-host.ts:807](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L807)

Builds a JSON-RPC error response for a failed dialect request, per §3 and §22.
(§26.8, R-26.8-a; AC-42.19) Reuses the S34 [buildErrorObject](buildErrorObject.md) so the
`error` shape and default messages are the single authoritative ones.

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

The request id being answered (echoed verbatim).

### code

`number`

The §22 error code.

### message?

`string`

OPTIONAL human-readable message; defaults to the registry name.

### data?

`unknown`

OPTIONAL sender-defined additional detail.

## Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)
