[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveListPromptsResultType

# Function: resolveListPromptsResultType()

> **resolveListPromptsResultType**(`result`): `string`

Defined in: [protocol/prompts.ts:336](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L336)

Resolves the `resultType` of a received `prompts/list` result, treating an
absent value as `"complete"`. (R-18.2-p, AC-28.18)

## Parameters

### result

The raw result object received on the wire.

#### resultType?

`unknown`

## Returns

`string`
