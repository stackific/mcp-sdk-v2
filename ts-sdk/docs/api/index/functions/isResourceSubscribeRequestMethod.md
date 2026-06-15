[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isResourceSubscribeRequestMethod

# Function: isResourceSubscribeRequestMethod()

> **isResourceSubscribeRequestMethod**(`_method`): `boolean`

Defined in: [protocol/resources-read.ts:532](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L532)

Returns `true` if `method` is a (non-existent) per-resource subscribe/
unsubscribe request — it ALWAYS returns `false`, because no such method
exists; opting in/out is done through the §10 filter, not a request.
(§17.7, R-17.7-a)

## Parameters

### \_method

`string`

## Returns

`boolean`
