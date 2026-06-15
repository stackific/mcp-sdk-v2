[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / declinedFilterKinds

# Function: declinedFilterKinds()

> **declinedFilterKinds**(`requested`, `acknowledged`): `object`

Defined in: [protocol/streaming.ts:399](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L399)

Returns the kinds the client requested but the server did NOT honor (declined),
so a client can handle them gracefully and not block waiting on a declined kind.
(§10.3, R-10.3-f)

Reports the boolean fields whose request was dropped and the requested-but-not-
acknowledged `resourceSubscriptions` URIs.

## Parameters

### requested

`objectOutputType`

### acknowledged

`objectOutputType`

## Returns

`object`

### fields

> **fields**: (`"toolsListChanged"` \| `"promptsListChanged"` \| `"resourcesListChanged"`)[]

### uris

> **uris**: `string`[]
