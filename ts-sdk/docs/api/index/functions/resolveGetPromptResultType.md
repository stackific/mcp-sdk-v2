[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveGetPromptResultType

# Function: resolveGetPromptResultType()

> **resolveGetPromptResultType**(`result`): `string`

Defined in: [protocol/prompts.ts:461](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L461)

Resolves the `resultType` of a received `prompts/get` result, treating an absent
value as `"complete"`. (R-18.4-p, AC-28.34)

## Parameters

### result

The raw result object received on the wire.

#### resultType?

`unknown`

## Returns

`string`
