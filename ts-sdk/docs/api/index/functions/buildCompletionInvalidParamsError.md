[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompletionInvalidParamsError

# Function: buildCompletionInvalidParamsError()

> **buildCompletionInvalidParamsError**(`detail`): [`CompletionError`](../interfaces/CompletionError.md)

Defined in: [protocol/completion.ts:599](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L599)

Builds a `-32602` (Invalid params) error for a malformed `completion/complete`
request — a missing `ref`, a `ref.type` outside the closed union, or a
missing/malformed `argument` name/value. (R-19.5-s, AC-29.4, AC-29.6, AC-29.7)

## Parameters

### detail

`string`

Human-readable detail describing what was invalid.

## Returns

[`CompletionError`](../interfaces/CompletionError.md)
