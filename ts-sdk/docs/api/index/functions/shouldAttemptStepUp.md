[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / shouldAttemptStepUp

# Function: shouldAttemptStepUp()

> **shouldAttemptStepUp**(`actor`): `boolean`

Defined in: [protocol/authorization-registration.ts:818](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L818)

Returns `true` when a client SHOULD attempt the step-up flow for a scope-related
error: always for a user-acting client (R-23.18-m); for a `client_credentials`
client it MAY attempt or abort, so this returns `false` (the conservative
default — the caller MAY override). (R-23.18-l, R-23.18-m, R-23.18-n)

## Parameters

### actor

[`StepUpActor`](../type-aliases/StepUpActor.md)

Who the client is acting for.

## Returns

`boolean`
