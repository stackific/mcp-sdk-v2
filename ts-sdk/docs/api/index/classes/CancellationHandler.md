[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CancellationHandler

# Class: CancellationHandler

Defined in: [protocol/progress.ts:299](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L299)

Receiver-side registry that maps in-flight request IDs to abort callbacks.
(R-15.2.2-d / RC-4)

When a valid `notifications/cancelled` arrives, the receiver SHOULD stop
processing the matching request, free associated resources, and suppress
sending the response. `CancellationHandler` wires that behaviour:

1. **Register** — before dispatching a long-running request, the handler
   registers an abort callback (`AbortController.abort`, queue removal, etc.).
2. **Trigger** — when a valid cancellation notification arrives (after
   `validateCancellationTarget` confirms eligibility), call `trigger()` to
   fire the callback and deregister the entry.
3. **Deregister** — on normal completion, call `deregister()` to remove the
   entry without firing the callback.

## Example

```ts
const handler = new CancellationHandler();
const ac = new AbortController();
handler.register(requestId, () => ac.abort());
// … on valid cancellation notification:
handler.trigger(requestId); // stops work, frees resources
```

## Constructors

### Constructor

> **new CancellationHandler**(): `CancellationHandler`

#### Returns

`CancellationHandler`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [protocol/progress.ts:343](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L343)

Number of currently registered abort callbacks.

##### Returns

`number`

## Methods

### register()

> **register**(`requestId`, `onCancel`): `void`

Defined in: [protocol/progress.ts:308](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L308)

Registers `onCancel` as the abort callback for `requestId`.

A previously registered handler for the same id is silently replaced —
callers should `deregister()` before re-using an id.

#### Parameters

##### requestId

`string` \| `number`

##### onCancel

() => `void`

#### Returns

`void`

***

### trigger()

> **trigger**(`requestId`): `boolean`

Defined in: [protocol/progress.ts:319](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L319)

Fires the abort callback for `requestId` and removes it from the registry.

Returns `true` when a handler was found and called (the request was stopped).
Returns `false` when no handler is registered for `requestId` — the
cancellation may have arrived after the work already completed.

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`boolean`

***

### deregister()

> **deregister**(`requestId`): `void`

Defined in: [protocol/progress.ts:333](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L333)

Removes the handler for `requestId` without calling it.

Call this on normal completion so the registry does not hold stale entries.
Safe to call for an unknown `requestId`.

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`void`

***

### has()

> **has**(`requestId`): `boolean`

Defined in: [protocol/progress.ts:338](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L338)

Returns `true` when an abort callback is registered for `requestId`.

#### Parameters

##### requestId

`string` \| `number`

#### Returns

`boolean`
