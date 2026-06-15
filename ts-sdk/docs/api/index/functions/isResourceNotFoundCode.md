[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isResourceNotFoundCode

# Function: isResourceNotFoundCode()

> **isResourceNotFoundCode**(`code`): `boolean`

Defined in: [protocol/resources-read.ts:115](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L115)

Returns `true` when `code` denotes resource-not-found from a CLIENT's
perspective — either the modern `-32602` or the legacy `-32002`. A client
SHOULD accept both. (§17.6, R-17.6-a, R-17.6-c)

## Parameters

### code

`unknown`

## Returns

`boolean`
