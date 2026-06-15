[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isEmptySubscriptionFilter

# Function: isEmptySubscriptionFilter()

> **isEmptySubscriptionFilter**(`filter`): `boolean`

Defined in: [protocol/streaming.ts:191](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L191)

Returns `true` when the filter requests no kinds at all — every boolean is
absent/`false` and `resourceSubscriptions` is absent/empty. Such a filter
yields an acknowledgement-only stream (a client SHOULD set at least one
field). (§10.2, R-10.2-k)

## Parameters

### filter

`objectOutputType`

## Returns

`boolean`
