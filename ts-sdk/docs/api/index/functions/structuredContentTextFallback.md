[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / structuredContentTextFallback

# Function: structuredContentTextFallback()

> **structuredContentTextFallback**(`structuredContent`): `objectOutputType`

Defined in: [protocol/tools-call.ts:288](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L288)

Serializes a structured value to a `text` `ContentBlock`, the textual
`content` fallback a server SHOULD provide alongside `structuredContent` for
clients that do not consume structured content. (§16.5, R-16.5-p)

The block carries the JSON serialization of the structured value, mirroring
the §16.5 weather example.

## Parameters

### structuredContent

`unknown`

## Returns

`objectOutputType`
