[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PlanStepUpOptions

# Interface: PlanStepUpOptions

Defined in: [protocol/authorization-registration.ts:927](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L927)

Inputs to [planStepUpAuthorization](../functions/planStepUpAuthorization.md).

## Properties

### actor

> **actor**: [`StepUpActor`](../type-aliases/StepUpActor.md)

Defined in: [protocol/authorization-registration.ts:929](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L929)

Who the client is acting for. (R-23.18-m, R-23.18-n)

***

### alreadyGranted

> **alreadyGranted**: readonly `string`[]

Defined in: [protocol/authorization-registration.ts:931](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L931)

The scopes the client already holds/requested. (R-23.18-o)

***

### challenge

> **challenge**: [`WwwAuthenticateChallenge`](WwwAuthenticateChallenge.md)

Defined in: [protocol/authorization-registration.ts:933](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L933)

The challenge driving the step-up (its `scope` is parsed for the union). (R-23.18-l)

***

### key

> **key**: [`ScopeUpgradeKey`](ScopeUpgradeKey.md)

Defined in: [protocol/authorization-registration.ts:935](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L935)

The resource-and-operation being upgraded, for retry tracking. (R-23.18-r)

***

### tracker

> **tracker**: [`ScopeUpgradeTracker`](../classes/ScopeUpgradeTracker.md)

Defined in: [protocol/authorization-registration.ts:937](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L937)

The shared upgrade tracker enforcing the retry bound. (R-23.18-q)

***

### forceForClientCredentials?

> `optional` **forceForClientCredentials?**: `boolean`

Defined in: [protocol/authorization-registration.ts:942](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L942)

`true` to attempt step-up even for a `client_credentials` client, exercising
the MAY of R-23.18-n. Defaults to `false`.
