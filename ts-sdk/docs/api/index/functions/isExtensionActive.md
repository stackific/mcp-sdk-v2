[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isExtensionActive

# Function: isExtensionActive()

> **isExtensionActive**(`identifier`, `clientExtensions`, `serverExtensions`): `boolean`

Defined in: [protocol/extensions.ts:303](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L303)

Returns `true` when extension `identifier` is ACTIVE between two peers — i.e.
both peers validly advertise it. A peer MUST NOT exercise an extension's
behavior unless this returns `true`. (R-6.5-l)

## Parameters

### identifier

`string`

### clientExtensions

`unknown`

### serverExtensions

`unknown`

## Returns

`boolean`
