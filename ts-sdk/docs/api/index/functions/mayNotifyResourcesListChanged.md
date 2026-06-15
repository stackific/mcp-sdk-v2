[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayNotifyResourcesListChanged

# Function: mayNotifyResourcesListChanged()

> **mayNotifyResourcesListChanged**(`filter`): `boolean`

Defined in: [protocol/resources-read.ts:515](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L515)

Returns `true` when a server MAY deliver `notifications/resources/list_changed`
on a stream whose §10 filter is `filter` — only when the client opted in via
`resourcesListChanged: true`. A server MUST NOT deliver it on a stream that did
not request the filter. (§17.7, R-17.7-d, R-17.7-e)

## Parameters

### filter

`objectOutputType`

## Returns

`boolean`
