[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompletionNotSupportedError

# Function: buildCompletionNotSupportedError()

> **buildCompletionNotSupportedError**(): [`CompletionError`](../interfaces/CompletionError.md)

Defined in: [protocol/completion.ts:585](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L585)

Builds the `-32601` (Method not found) error a server returns when it receives
`completion/complete` without having advertised the `completions` capability.
(R-19.1-d, R-19.5-q, AC-29.2)

## Returns

[`CompletionError`](../interfaces/CompletionError.md)
