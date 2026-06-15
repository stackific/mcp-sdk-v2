[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayEmitResourcesListChanged

# Function: mayEmitResourcesListChanged()

> **mayEmitResourcesListChanged**(`serverCaps`): `boolean`

Defined in: [protocol/resources.ts:145](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L145)

Returns `true` when the server MAY emit `notifications/resources/list_changed`:
it requires BOTH the `resources` capability AND the `listChanged` sub-flag.
(§17.1, R-17.1-i, R-17.1-k)

Reuses [clientShouldExpectNotification](clientShouldExpectNotification.md), whose S10 gating map already binds
this notification to `resources.listChanged`.

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
