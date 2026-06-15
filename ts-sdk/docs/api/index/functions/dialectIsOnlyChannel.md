[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / dialectIsOnlyChannel

# Function: dialectIsOnlyChannel()

> **dialectIsOnlyChannel**(`grantedPaths`): `boolean`

Defined in: [protocol/ui-host.ts:1169](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L1169)

Returns `true` when the §26.5 dialect channel is the ONLY path granted between
the rendered UI and the host — i.e. no other ambient path to host or user data
exists. The host MUST NOT grant ambient access through any other path.
(§26.7, R-26.7-c; AC-42.13)

## Parameters

### grantedPaths

`Iterable`\<`string`\>

The set of paths the host grants the UI to reach host/
  user data. Conforming hosts grant exactly the dialect channel.

## Returns

`boolean`
