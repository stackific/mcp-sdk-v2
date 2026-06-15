[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompletionInternalError

# Function: buildCompletionInternalError()

> **buildCompletionInternalError**(`detail?`): [`CompletionError`](../interfaces/CompletionError.md)

Defined in: [protocol/completion.ts:628](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L628)

Builds the `-32603` (Internal error) error a server returns when computing
completions fails internally (or a rate limit sheds the request). (R-19.5-j,
R-19.5-t, AC-29.21)

## Parameters

### detail?

`string`

OPTIONAL human-readable detail.

## Returns

[`CompletionError`](../interfaces/CompletionError.md)
