[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildPromptInternalError

# Function: buildPromptInternalError()

> **buildPromptInternalError**(`detail?`): [`PromptsGetError`](../interfaces/PromptsGetError.md)

Defined in: [protocol/prompts.ts:607](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L607)

Builds the `-32603` (Internal error) error a server returns when resolving a
`prompts/get` fails internally. (R-18.4-s, AC-28.36)

## Parameters

### detail?

`string`

OPTIONAL human-readable detail.

## Returns

[`PromptsGetError`](../interfaces/PromptsGetError.md)
