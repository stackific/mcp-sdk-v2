[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / shouldUseHttpsScheme

# Function: shouldUseHttpsScheme()

> **shouldUseHttpsScheme**(`directlyFetchable`): `boolean`

Defined in: [protocol/resources-read.ts:645](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L645)

Returns `true` when using the `https` scheme is consistent with the §17.9
guidance for a resource with the given direct-fetchability. `https` is
appropriate ONLY when the client can fetch it directly; otherwise a server
SHOULD prefer another scheme. (§17.9, R-17.9-b, R-17.9-c)

## Parameters

### directlyFetchable

`boolean`

## Returns

`boolean`
