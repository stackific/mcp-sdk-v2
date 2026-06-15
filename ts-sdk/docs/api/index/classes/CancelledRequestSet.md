[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancelledRequestSet

# Class: CancelledRequestSet

Defined in: [protocol/progress.ts:378](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L378)

Sender-side set of request IDs for which a `notifications/cancelled` has been
sent but whose response has not yet arrived. (R-15.2.3-e / RC-6)

A sender SHOULD distinctly ignore (not just tolerate) late responses to
cancelled requests — so callers can detect the race rather than silently
processing a stale result.

Usage:
1. **`add(requestId)`** — call immediately after sending the cancellation
   notification.
2. **`isIgnorable(requestId)`** — call when a response arrives; if `true`,
   discard the response without processing it.
3. **`acknowledge(requestId)`** — call after discarding the late response to
   prevent unbounded set growth.

## Example

```ts
const cancelled = new CancelledRequestSet();
sendCancellationNotification(requestId);
cancelled.add(requestId);
// … later, when a response arrives:
if (cancelled.isIgnorable(response.id)) {
  cancelled.acknowledge(response.id);
  return; // silently discard
}
```

## Constructors

### Constructor

> **new CancelledRequestSet**(): `CancelledRequestSet`

#### Returns

`CancelledRequestSet`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [protocol/progress.ts:407](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L407)

Number of IDs awaiting a late response to discard.

##### Returns

`number`

## Methods

### add()

> **add**(`requestId`): `void`

Defined in: [protocol/progress.ts:386](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L386)

Marks `requestId` as cancelled.

Call this after sending `notifications/cancelled` for the request.

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`void`

***

### isIgnorable()

> **isIgnorable**(`requestId`): `boolean`

Defined in: [protocol/progress.ts:394](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L394)

Returns `true` when a response for `requestId` SHOULD be ignored because
a cancellation notification was previously sent for it. (R-15.2.3-e)

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`boolean`

***

### acknowledge()

> **acknowledge**(`requestId`): `void`

Defined in: [protocol/progress.ts:402](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L402)

Removes `requestId` from the set after the late response has been received
and discarded. Safe to call for an unknown `requestId`.

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`void`
