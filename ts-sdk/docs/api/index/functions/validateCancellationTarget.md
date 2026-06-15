[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateCancellationTarget

# Function: validateCancellationTarget()

> **validateCancellationTarget**(`requestId`, `inFlightIds`, `discoverRequestId?`): [`CancellationValidationResult`](../type-aliases/CancellationValidationResult.md)

Defined in: [protocol/progress.ts:452](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L452)

Validates that a cancellation target (`requestId` from a
`notifications/cancelled`) is eligible given the sender's in-flight set.

A valid target must:
  - be present (requestId is known)
  - appear in `inFlightIds` (in-flight from the sender's perspective)
  - not be the `server/discover` id (if `discoverRequestId` is provided)

(R-15.2.1-a, R-15.2.1-b, R-15.2.2-b)

## Parameters

### requestId

`string` \| `number` \| `undefined`

The target id from the cancellation notification.

### inFlightIds

`ReadonlySet`\<`string` \| `number`\>

Ids of requests the sender has issued and not yet received
                          a response to.

### discoverRequestId?

`string` \| `number`

If provided, the id of the `server/discover` request
                          that must not be cancelled.

## Returns

[`CancellationValidationResult`](../type-aliases/CancellationValidationResult.md)
