[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateExactIssuer

# Function: validateExactIssuer()

> **validateExactIssuer**(`options`): [`ExactIssuerValidation`](../type-aliases/ExactIssuerValidation.md)

Defined in: [protocol/authorization-registration.ts:1066](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1066)

Validates the authorization response's `iss` against the recorded issuer by
exact string comparison — the mix-up defence a client MUST perform BEFORE
transmitting the authorization code, including the
`authorization_response_iss_parameter_supported` reject rule. (R-23.19-e,
R-23.19-f, R-23.19-g, R-23.19-h)

Delegates to S36's [validateIssuer](validateIssuer.md) (the §23.7 decision table); surfaced
here under the §23.19 security atoms. The recorded issuer MUST have been captured
before redirect (R-23.19-e) and stored with the PKCE verifier and `state` in the
same per-request record (R-23.19-j, see [sameRequestRecord](sameRequestRecord.md)). On failure
the caller MUST NOT redeem the code or display the response's `error`/details
(R-23.19-i, S36's `safeAuthorizationError`).

## Parameters

### options

#### iss?

`string`

The decoded `iss` from the response, if any.

#### recordedIssuer

`string`

The issuer recorded before redirect. (R-23.19-e)

#### issParameterSupported?

`boolean`

The AS flag, if advertised. (R-23.19-g)

## Returns

[`ExactIssuerValidation`](../type-aliases/ExactIssuerValidation.md)
