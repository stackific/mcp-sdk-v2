[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayFetchDirectly

# Function: mayFetchDirectly()

> **mayFetchDirectly**(`uri`): `boolean`

Defined in: [protocol/resources-read.ts:604](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L604)

Returns `true` when a client MAY skip `resources/read` and fetch `uri`
directly from the web — true exactly when `uri` is an `https` resource URI.
(§17.5, R-17.5-y)

## Parameters

### uri

`string`

## Returns

`boolean`
