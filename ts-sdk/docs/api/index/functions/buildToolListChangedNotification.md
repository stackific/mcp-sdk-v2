[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildToolListChangedNotification

# Function: buildToolListChangedNotification()

> **buildToolListChangedNotification**(`meta?`): `objectOutputType`

Defined in: [protocol/tools-call.ts:631](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L631)

Builds a `notifications/tools/list_changed` notification. `params` is included
only when `_meta` is supplied — the notification needs no payload and MAY be
issued without any prior explicit subscription request. (§16.8, R-16.8-a,
R-16.8-b)

## Parameters

### meta?

`Record`\<`string`, `unknown`\>

OPTIONAL `_meta` members to attach.

## Returns

`objectOutputType`
