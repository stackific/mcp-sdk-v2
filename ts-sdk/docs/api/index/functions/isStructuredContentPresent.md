[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isStructuredContentPresent

# Function: isStructuredContentPresent()

> **isStructuredContentPresent**(`result`): `boolean`

Defined in: [protocol/tools-call.ts:274](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L274)

Returns `true` when `structuredContent` is *present* on a result, treating an
explicit `null` value as present (it is a valid structured value, R-16.5-n)
while an omitted key is absent. Use this rather than a truthiness check so an
intentional `null`/`false`/`0`/`""` structured value is not mistaken for
absence. (R-16.5-n)

## Parameters

### result

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
