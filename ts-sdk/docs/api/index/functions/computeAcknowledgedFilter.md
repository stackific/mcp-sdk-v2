[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / computeAcknowledgedFilter

# Function: computeAcknowledgedFilter()

> **computeAcknowledgedFilter**(`requested`, `serverCaps`): `objectOutputType`

Defined in: [protocol/streaming.ts:363](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/streaming.ts#L363)

Computes the honored-subset `SubscriptionFilter` for the acknowledgement: a kind
is honored only when the client requested it AND the gating server
capability/sub-flag is declared. Unsupported kinds are OMITTED entirely. (§10.3,
R-10.3-c, R-10.3-d; gating per R-10.5-l)

For `resourceSubscriptions`, the honored list is the requested URIs (subset the
server agrees to watch) when `resources.subscribe` is declared, else omitted.

## Parameters

### requested

`objectOutputType`

The client's requested filter.

### serverCaps

`Record`\<`string`, `unknown`\>

The server's declared `ServerCapabilities`.

## Returns

`objectOutputType`
