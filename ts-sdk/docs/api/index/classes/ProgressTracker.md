[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProgressTracker

# Class: ProgressTracker

Defined in: [protocol/progress.ts:139](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L139)

Tracks active progress tokens for a single sender, enforcing uniqueness and
monotonicity rules from §15.1.

Rules enforced:
  R-15.1.1-c  Tokens MUST be unique across the sender's currently active requests.
  R-15.1.1-d  Receivers MUST treat the token as opaque (no content inspection).
  R-15.1.3-e  `progress` MUST strictly increase across successive notifications.
  R-15.1.4-g  MUST stop emitting progress once the operation reaches terminal state.

## Constructors

### Constructor

> **new ProgressTracker**(): `ProgressTracker`

#### Returns

`ProgressTracker`

## Accessors

### size

#### Get Signature

> **get** **size**(): `number`

Defined in: [protocol/progress.ts:201](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L201)

Number of currently active progress tokens.

##### Returns

`number`

***

### activeTokens

#### Get Signature

> **get** **activeTokens**(): readonly (`string` \| `number`)[]

Defined in: [protocol/progress.ts:206](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L206)

Snapshot of all currently active tokens.

##### Returns

readonly (`string` \| `number`)[]

## Methods

### register()

> **register**(`token`): `void`

Defined in: [protocol/progress.ts:146](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L146)

Registers `token` as active when a request carrying it is about to be sent.

#### Parameters

##### token

`string` \| `number`

#### Returns

`void`

#### Throws

when `token` is already active — enforces R-15.1.1-c.

***

### complete()

> **complete**(`token`): `void`

Defined in: [protocol/progress.ts:162](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L162)

Removes `token` from the active set once the operation has reached a
terminal state (final response sent or received). (R-15.1.4-g)

Safe to call for a token that is not currently tracked.

#### Parameters

##### token

`string` \| `number`

#### Returns

`void`

***

### has()

> **has**(`token`): `boolean`

Defined in: [protocol/progress.ts:167](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L167)

Returns `true` when `token` is currently registered as active.

#### Parameters

##### token

`string` \| `number`

#### Returns

`boolean`

***

### isMonotonic()

> **isMonotonic**(`token`, `progress`): `boolean`

Defined in: [protocol/progress.ts:177](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L177)

Returns `true` when `progress` is strictly greater than the last recorded
value for `token`, satisfying the monotonic-increase invariant. (R-15.1.3-e)

Returns `false` for an unknown (not-yet-registered or already-completed) token.

#### Parameters

##### token

`string` \| `number`

##### progress

`number`

#### Returns

`boolean`

***

### recordProgress()

> **recordProgress**(`token`, `progress`): `void`

Defined in: [protocol/progress.ts:189](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/progress.ts#L189)

Records `progress` as the latest value for `token` after a monotonicity
check has passed.

#### Parameters

##### token

`string` \| `number`

##### progress

`number`

#### Returns

`void`

#### Throws

when `token` is not currently active.
