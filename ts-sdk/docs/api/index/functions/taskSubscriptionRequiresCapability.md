[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / taskSubscriptionRequiresCapability

# Function: taskSubscriptionRequiresCapability()

> **taskSubscriptionRequiresCapability**(`filter`, `clientNegotiated`): `boolean`

Defined in: [protocol/tasks-lifecycle.ts:599](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks-lifecycle.ts#L599)

Returns `true` when supplying a non-empty `taskIds` subscription filter requires
the tasks capability and the client has NOT negotiated it — in which case the
server MUST respond to `subscriptions/listen` with `-32003`. (§25.10, R-25.10-e,
AC-40.34)

When `true`, the server answers with [buildTasksMissingCapabilityError](buildTasksMissingCapabilityError.md)
for `subscriptions/listen`. A filter with no `taskIds` (or an empty array) does
not trigger the requirement.

## Parameters

### filter

`unknown`

The `notifications` filter from `subscriptions/listen`.

### clientNegotiated

`boolean`

Whether the client negotiated the tasks capability.

## Returns

`boolean`
