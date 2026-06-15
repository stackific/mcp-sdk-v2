[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RegisterWithRetryOptions

# Interface: RegisterWithRetryOptions

Defined in: [protocol/authorization-registration.ts:408](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L408)

Inputs to [registerWithRetry](../functions/registerWithRetry.md).

## Properties

### initialApplicationType

> **initialApplicationType**: [`ApplicationType`](../type-aliases/ApplicationType.md)

Defined in: [protocol/authorization-registration.ts:410](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L410)

The `application_type` for the first attempt; see [applicationTypeForRedirectUris](../functions/applicationTypeForRedirectUris.md).

***

### attempt

> **attempt**: (`applicationType`) => `Promise`\<\{ `status`: `number`; `body`: `unknown`; \}\>

Defined in: [protocol/authorization-registration.ts:415](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L415)

Performs one registration POST for the given `application_type`, returning the
AS's HTTP status and parsed body. Injected so this is transport-agnostic.

#### Parameters

##### applicationType

[`ApplicationType`](../type-aliases/ApplicationType.md)

#### Returns

`Promise`\<\{ `status`: `number`; `body`: `unknown`; \}\>

***

### maxAttempts?

> `optional` **maxAttempts?**: `number`

Defined in: [protocol/authorization-registration.ts:421](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L421)

The maximum number of attempts (the initial attempt plus retries). MUST be a
few at most; defaults to `2` (one retry with the alternate `application_type`).
(R-23.15-f)
