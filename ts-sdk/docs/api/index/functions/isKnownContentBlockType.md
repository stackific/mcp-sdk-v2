[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isKnownContentBlockType

# Function: isKnownContentBlockType()

> **isKnownContentBlockType**(`type`): type is "resource" \| "text" \| "image" \| "audio" \| "resource\_link"

Defined in: [types/content.ts:150](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/content.ts#L150)

Returns `true` when `type` is a known, supported `ContentBlock` discriminator.
A receiver SHOULD treat unknown types as unsupported content, not as errors.
(R-14.4-b)

## Parameters

### type

`string`

## Returns

type is "resource" \| "text" \| "image" \| "audio" \| "resource\_link"
