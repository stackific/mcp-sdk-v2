[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / methodNotFoundResponse

# Function: methodNotFoundResponse()

> **methodNotFoundResponse**(`id`, `message?`): [`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)

Defined in: [protocol/ui-host.ts:828](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L828)

Builds the §22 method-not-found (`-32601`) error response a receiver MUST send
when it receives a dialect REQUEST naming a method it does not implement.
(§26.8, R-26.8-c; AC-42.21)

## Parameters

### id

[`JsonRpcId`](../type-aliases/JsonRpcId.md)

The request id being answered.

### message?

`string` = `'Method not found'`

OPTIONAL override; defaults to `"Method not found"`.

## Returns

[`JsonRpcErrorResponse`](../interfaces/JsonRpcErrorResponse.md)
