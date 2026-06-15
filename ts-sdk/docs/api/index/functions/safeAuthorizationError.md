[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / safeAuthorizationError

# Function: safeAuthorizationError()

> **safeAuthorizationError**(`params`, `issResult`): \{ `error`: `string`; `errorDescription?`: `string`; `errorUri?`: `string`; \} \| `undefined`

Defined in: [protocol/authorization-flow.ts:1181](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1181)

Returns the displayable error details from an authorization redirect ONLY when
`iss` validation succeeds, withholding them on mismatch. (R-23.7-h)

A thin convenience over [validateIssuer](validateIssuer.md): a client MUST NOT act on or
display `error`/`error_description`/`error_uri` when the `iss` of an error
response does not match the recorded issuer. Returns `undefined` when there is
no error, or when the details must be withheld.

## Parameters

### params

[`AuthorizationResponseParams`](../interfaces/AuthorizationResponseParams.md)

The parsed authorization response.

### issResult

[`IssuerValidationResult`](../type-aliases/IssuerValidationResult.md)

The result of [validateIssuer](validateIssuer.md) for this response.

## Returns

\{ `error`: `string`; `errorDescription?`: `string`; `errorUri?`: `string`; \} \| `undefined`
