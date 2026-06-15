[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildElicitationCompleteNotification

# Function: buildElicitationCompleteNotification()

> **buildElicitationCompleteNotification**(`elicitationId`): `objectOutputType`

Defined in: [protocol/elicitation-form.ts:1067](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1067)

Builds a `notifications/elicitation/complete` notification for `elicitationId`.
(§20.6, R-20.6-a, R-20.6-b)

The caller (the server) MUST send the returned notification only to the client
that initiated the elicitation (R-20.6-c) — a transport-level concern this
builder cannot enforce; it ensures the `elicitationId` is carried verbatim.

## Parameters

### elicitationId

`string`

## Returns

`objectOutputType`

## Throws

When `elicitationId` is empty (R-20.6-b).
