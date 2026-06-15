[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / planStepUpAuthorization

# Function: planStepUpAuthorization()

> **planStepUpAuthorization**(`options`): [`StepUpPlan`](../interfaces/StepUpPlan.md)

Defined in: [protocol/authorization-registration.ts:962](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L962)

Plans one step-up re-authorization end to end: decides whether to proceed (by
actor and remaining retries), computes the UNION scope set that never drops
already-granted scopes, and records the attempt against the bound. (R-23.18-l,
R-23.18-m, R-23.18-n, R-23.18-o, R-23.18-p, R-23.18-q, R-23.18-r, R-23.1-ae,
R-23.1-af, R-23.1-ag)

Proceeds when (a) the actor SHOULD/elects to step up — a user-acting client, or
a `client_credentials` client with `forceForClientCredentials` — AND (b) the
tracker still permits a retry for the `key`. When it proceeds it records the
attempt (R-23.1-ag) and returns the unioned `scopes`/`scope` for a fresh
authorization-code+PKCE flow (built with S36's `buildAuthorizationRequest`).
When the retry bound is exhausted it returns `proceed: false` so the caller
treats the failure as permanent (R-23.18-q).

## Parameters

### options

[`PlanStepUpOptions`](../interfaces/PlanStepUpOptions.md)

The actor, already-granted scopes, challenge, key, and tracker.

## Returns

[`StepUpPlan`](../interfaces/StepUpPlan.md)
