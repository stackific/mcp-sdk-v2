[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUnknownPromptError

# Function: buildUnknownPromptError()

> **buildUnknownPromptError**(`name`): [`PromptsGetError`](../interfaces/PromptsGetError.md)

Defined in: [protocol/prompts.ts:580](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L580)

Builds the `-32602` (Invalid params) error a server returns when a `prompts/get`
names a prompt it does not offer. (R-18.4-d, R-18.4-s, AC-28.29)

## Parameters

### name

`string`

The unknown prompt name the client supplied.

## Returns

[`PromptsGetError`](../interfaces/PromptsGetError.md)
