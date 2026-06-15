[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateAuthorizationIssuer

# Function: validateAuthorizationIssuer()

> **validateAuthorizationIssuer**(`options`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}

Defined in: [protocol/security.ts:854](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L854)

Validates the exact-issuer mix-up defense for an authorization response,
delegating to S37's [validateExactIssuer](validateExactIssuer.md) (which §23 owns). The client MUST
have recorded the expected issuer before redirect and MUST compare any returned
issuer by exact string comparison, rejecting mismatches. (§28.5, R-28.5-h,
R-28.5-i; AC-44.14)

## Parameters

### options

#### iss?

`string`

The `iss` returned in the authorization response, if any.

#### recordedIssuer

`string`

The issuer recorded BEFORE redirect (R-28.5-h).

#### issParameterSupported?

`boolean`

The AS `authorization_response_iss_parameter_supported` flag.

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `string`; \}
