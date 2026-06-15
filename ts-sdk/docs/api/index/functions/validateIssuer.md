[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateIssuer

# Function: validateIssuer()

> **validateIssuer**(`options`): [`IssuerValidationResult`](../type-aliases/IssuerValidationResult.md)

Defined in: [protocol/authorization-flow.ts:1057](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1057)

Validates the authorization response's `iss` against the recorded issuer per
§23.7, the check a client MUST perform BEFORE transmitting the authorization
code to any token endpoint. (R-23.7-a, R-23.7-d, R-23.7-e, R-23.7-f, R-23.7-g)

Applies [issuerValidationDecision](issuerValidationDecision.md); when the decision is `compare`, the
present `iss` is compared to `recordedIssuer` by EXACT string match — no
scheme/host case folding, default-port elision, trailing-slash, or
percent-encoding normalization is applied (R-23.7-g). A `reject` decision (the
AS advertises `iss` support but the response omits it) fails (R-23.7-e). On any
failure the caller MUST NOT redeem the code, and for error responses MUST NOT
act on `error`/`error_description`/`error_uri` (R-23.7-h, see
[safeAuthorizationError](safeAuthorizationError.md)).

## Parameters

### options

[`ValidateIssuerOptions`](../interfaces/ValidateIssuerOptions.md)

The decoded `iss`, the recorded issuer, and the AS flag.

## Returns

[`IssuerValidationResult`](../type-aliases/IssuerValidationResult.md)
