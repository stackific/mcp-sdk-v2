[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayClientExpectToolsListChanged

# Function: mayClientExpectToolsListChanged()

> **mayClientExpectToolsListChanged**(`serverCaps`): `boolean`

Defined in: [protocol/tools.ts:148](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L148)

Returns `true` when a client may rely on receiving
`notifications/tools/list_changed`. A client MUST NOT rely on it unless the
server declared `tools.listChanged: true`. (§16.1, R-16.1-e; delegates to S10
`clientShouldExpectNotification`.)

## Parameters

### serverCaps

`Record`\<`string`, `unknown`\>

## Returns

`boolean`
