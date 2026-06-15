[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildMissingArgumentError

# Function: buildMissingArgumentError()

> **buildMissingArgumentError**(`missing`): [`PromptsGetError`](../interfaces/PromptsGetError.md)

Defined in: [protocol/prompts.ts:594](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L594)

Builds the `-32602` (Invalid params) error a server returns when a `prompts/get`
omits one or more arguments the prompt declares `required: true`. (R-18.3-m,
R-18.4-g, R-18.4-s, AC-28.27, AC-28.30)

## Parameters

### missing

readonly `string`[]

The names of the omitted required arguments.

## Returns

[`PromptsGetError`](../interfaces/PromptsGetError.md)
