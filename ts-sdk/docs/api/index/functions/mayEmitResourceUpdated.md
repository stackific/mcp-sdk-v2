[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayEmitResourceUpdated

# Function: mayEmitResourceUpdated()

> **mayEmitResourceUpdated**(`serverCaps`): `boolean`

Defined in: [protocol/resources.ts:156](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L156)

Returns `true` when the server MAY emit `notifications/resources/updated`: it
requires BOTH the `resources` capability AND the `subscribe` sub-flag.
(§17.1, R-17.1-i, R-17.1-l)

Reuses [clientShouldExpectNotification](clientShouldExpectNotification.md) (S10 binds it to `resources.subscribe`).

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
