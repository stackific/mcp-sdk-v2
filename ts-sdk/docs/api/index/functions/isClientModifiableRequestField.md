[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isClientModifiableRequestField

# Function: isClientModifiableRequestField()

> **isClientModifiableRequestField**(`field`): field is "metadata" \| "systemPrompt" \| "includeContext" \| "temperature" \| "stopSequences"

Defined in: [protocol/sampling.ts:834](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L834)

Returns `true` when `field` is one the client MAY modify/omit. (R-21.2.10-e)

## Parameters

### field

`string`

## Returns

field is "metadata" \| "systemPrompt" \| "includeContext" \| "temperature" \| "stopSequences"
