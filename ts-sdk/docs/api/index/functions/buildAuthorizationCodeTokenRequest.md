[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildAuthorizationCodeTokenRequest

# Function: buildAuthorizationCodeTokenRequest()

> **buildAuthorizationCodeTokenRequest**(`options`): [`AuthorizationCodeTokenRequest`](../interfaces/AuthorizationCodeTokenRequest.md)

Defined in: [protocol/authorization-flow.ts:1260](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1260)

Builds the authorization-code token-request body (Step 4), fixing
`grant_type=authorization_code` and carrying the PKCE `code_verifier` plus the
REQUIRED `resource` parameter. (R-23.5-n, R-23.5-o, R-23.5-p, R-23.6-b)

The `redirect_uri` and `resource` MUST be byte-identical to those sent in Step 2;
callers SHOULD pass the same values — [assertResourceMatchesStep2](assertResourceMatchesStep2.md) can
verify the `resource` invariant. (R-23.5-o, R-23.5-p)

## Parameters

### options

[`BuildAuthorizationCodeTokenRequestOptions`](../interfaces/BuildAuthorizationCodeTokenRequestOptions.md)

The code, PKCE verifier, redirect URI, client, and resource.

## Returns

[`AuthorizationCodeTokenRequest`](../interfaces/AuthorizationCodeTokenRequest.md)
