[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUnknownReferenceError

# Function: buildUnknownReferenceError()

> **buildUnknownReferenceError**(`detail`): [`CompletionError`](../interfaces/CompletionError.md)

Defined in: [protocol/completion.ts:614](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L614)

Builds the `-32602` (Invalid params) error a server returns when `ref` names a
prompt or resource template the server does not offer, or when `argument.name`
is not a valid argument of the referenced target — reported as Invalid params,
NOT as a not-found result. (R-19.5-r, AC-29.24)

## Parameters

### detail

`string`

Human-readable detail naming the unknown ref or argument.

## Returns

[`CompletionError`](../interfaces/CompletionError.md)
