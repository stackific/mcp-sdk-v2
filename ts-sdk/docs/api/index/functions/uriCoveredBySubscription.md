[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / uriCoveredBySubscription

# Function: uriCoveredBySubscription()

> **uriCoveredBySubscription**(`updatedUri`, `subscribedUri`): `boolean`

Defined in: [protocol/streaming.ts:423](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L423)

Returns `true` when `updatedUri` is covered by `subscribedUri` — either an exact
match or a sub-resource of a subscribed container URI (the updated URI MAY be a
descendant). (§10.5, R-10.5-j)

Container matching is path-prefix based after a normalized origin+path compare:
`file:///dir` covers `file:///dir/file.txt`. A bare prefix that is not a path
boundary (e.g. `file:///dir` vs `file:///directory`) does NOT match.

## Parameters

### updatedUri

`string`

### subscribedUri

`string`

## Returns

`boolean`
