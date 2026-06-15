[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / registerWithRetry

# Function: registerWithRetry()

> **registerWithRetry**(`options`): `Promise`\<[`DcrRetryResult`](../interfaces/DcrRetryResult.md)\>

Defined in: [protocol/authorization-registration.ts:440](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L440)

Performs Dynamic Client Registration with bounded retry, surfacing a meaningful
error and retrying with an adjusted `application_type` when the AS rejects on a
redirect-URI / application-type constraint. (R-23.15-d, R-23.15-e, R-23.15-f)

A client MUST be prepared for OIDC redirect-URI rejection (R-23.15-d). Each
attempt's response is interpreted by S36's
`handleDynamicClientRegistrationResponse`; on a retryable failure (e.g. a `400`
redirect-URI/application-type constraint), the `application_type` is flipped
(`native` ↔ `web`) for the next attempt (R-23.15-f), up to `maxAttempts`. The
returned `result` carries a human-readable `reason` on failure for the client to
surface (R-23.15-e). This never throws on an AS rejection — it returns the
structured failure.

## Parameters

### options

[`RegisterWithRetryOptions`](../interfaces/RegisterWithRetryOptions.md)

The initial application type, the attempt callback, and limits.

## Returns

`Promise`\<[`DcrRetryResult`](../interfaces/DcrRetryResult.md)\>
