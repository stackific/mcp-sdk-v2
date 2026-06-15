[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DcrRetryResult

# Interface: DcrRetryResult

Defined in: [protocol/authorization-registration.ts:400](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L400)

Outcome of [registerWithRetry](../functions/registerWithRetry.md): the final result and the attempts made.

## Properties

### result

> **result**: [`DynamicClientRegistrationResult`](../type-aliases/DynamicClientRegistrationResult.md)

Defined in: [protocol/authorization-registration.ts:402](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L402)

The final DCR result — success or the last failure.

***

### attempts

> **attempts**: [`ApplicationType`](../type-aliases/ApplicationType.md)[]

Defined in: [protocol/authorization-registration.ts:404](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L404)

The `application_type` of each attempt, in order, for diagnostics.
