[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ScopeUpgradeTracker

# Class: ScopeUpgradeTracker

Defined in: [protocol/authorization-registration.ts:844](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L844)

Tracks bounded step-up retry attempts per resource-and-operation combination, so
a client retries no more than a few times and treats persistent failure as a
permanent authorization failure. (R-23.18-q, R-23.18-r, R-23.1-af, R-23.1-ag)

Each [ScopeUpgradeKey](../interfaces/ScopeUpgradeKey.md) accumulates an attempt count; once the bound is
reached, [nextAction](#nextaction) returns `'permanent-failure'` rather than `'retry'`,
implementing the retry limit (R-23.18-q) and the per-resource-and-operation
attempt tracking that avoids repeated failures for the same combination
(R-23.18-r, R-23.1-ag).

## Constructors

### Constructor

> **new ScopeUpgradeTracker**(`maxAttempts?`): `ScopeUpgradeTracker`

Defined in: [protocol/authorization-registration.ts:853](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L853)

#### Parameters

##### maxAttempts?

`number` = `3`

The maximum number of step-up attempts per
  resource-and-operation; MUST be a few at most. Defaults to `3`. (R-23.18-q)

#### Returns

`ScopeUpgradeTracker`

#### Throws

When `maxAttempts` is not a positive integer.

## Accessors

### maxAttempts

#### Get Signature

> **get** **maxAttempts**(): `number`

Defined in: [protocol/authorization-registration.ts:861](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L861)

The configured retry bound.

##### Returns

`number`

## Methods

### attemptsFor()

> **attemptsFor**(`key`): `number`

Defined in: [protocol/authorization-registration.ts:870](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L870)

Returns the number of step-up attempts recorded so far for `key`. (R-23.1-ag)

#### Parameters

##### key

[`ScopeUpgradeKey`](../interfaces/ScopeUpgradeKey.md)

#### Returns

`number`

***

### canRetry()

> **canRetry**(`key`): `boolean`

Defined in: [protocol/authorization-registration.ts:880](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L880)

Returns `true` when another step-up attempt is permitted for `key` (the bound
has not been reached). (R-23.18-q)

#### Parameters

##### key

[`ScopeUpgradeKey`](../interfaces/ScopeUpgradeKey.md)

The resource-and-operation combination.

#### Returns

`boolean`

***

### recordAttempt()

> **recordAttempt**(`key`): `number`

Defined in: [protocol/authorization-registration.ts:889](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L889)

Records one step-up attempt for `key` and returns the new attempt count. (R-23.1-ag)

#### Parameters

##### key

[`ScopeUpgradeKey`](../interfaces/ScopeUpgradeKey.md)

The resource-and-operation combination.

#### Returns

`number`

***

### nextAction()

> **nextAction**(`key`): [`StepUpAction`](../type-aliases/StepUpAction.md)

Defined in: [protocol/authorization-registration.ts:903](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L903)

Records an attempt for `key` and returns whether to `'retry'` or treat the
failure as a `'permanent-failure'`, implementing the bounded retry. After the
bound is reached, persistent failure MUST be treated as a permanent
authorization failure. (R-23.18-q, R-23.1-af)

#### Parameters

##### key

[`ScopeUpgradeKey`](../interfaces/ScopeUpgradeKey.md)

The resource-and-operation combination.

#### Returns

[`StepUpAction`](../type-aliases/StepUpAction.md)

***

### reset()

> **reset**(`key`): `void`

Defined in: [protocol/authorization-registration.ts:909](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L909)

Clears the attempt count for `key` (e.g. after a successful retry).

#### Parameters

##### key

[`ScopeUpgradeKey`](../interfaces/ScopeUpgradeKey.md)

#### Returns

`void`
