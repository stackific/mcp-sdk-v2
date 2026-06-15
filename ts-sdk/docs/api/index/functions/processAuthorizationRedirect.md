[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / processAuthorizationRedirect

# Function: processAuthorizationRedirect()

> **processAuthorizationRedirect**(`redirect`, `record`, `options?`): [`AuthorizationRedirectResult`](../type-aliases/AuthorizationRedirectResult.md)

Defined in: [protocol/authorization-flow.ts:1128](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1128)

Processes a Step-3 authorization redirect end to end: parses the response,
verifies `state`, validates `iss` per §23.7, and only then yields the code for
redemption. (§23.5 Step 3, R-23.5-h, R-23.5-l, R-23.5-m, R-23.7-a, R-23.7-h)

Order of checks (all MUST pass before the code is redeemed):
  1. `state` matches the value sent (R-23.5-l);
  2. `iss` validates against the recorded issuer per §23.7 (R-23.5-m, R-23.7-a).

On an error response, `error`/`error_description`/`error_uri` are returned in
`error` ONLY when `iss` validation succeeds; on `iss` mismatch they are
withheld and MUST NOT be acted on or displayed (R-23.7-h).

## Parameters

### redirect

`string`

The raw redirect URL or query string.

### record

`Pick`\<[`AuthorizationFlowRecord`](../interfaces/AuthorizationFlowRecord.md), `"state"` \| `"recordedIssuer"`\>

The Step-1 record (recorded issuer + sent `state`).

### options?

#### issParameterSupported?

`boolean`

The AS metadata flag, if advertised.

## Returns

[`AuthorizationRedirectResult`](../type-aliases/AuthorizationRedirectResult.md)
