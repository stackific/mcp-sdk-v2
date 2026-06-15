[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / handleDynamicClientRegistrationResponse

# Function: handleDynamicClientRegistrationResponse()

> **handleDynamicClientRegistrationResponse**(`status`, `body`): [`DynamicClientRegistrationResult`](../type-aliases/DynamicClientRegistrationResult.md)

Defined in: [protocol/authorization-flow.ts:523](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L523)

Handles a DCR registration response, surfacing a meaningful error on failure and
flagging whether a retry (with adjusted `application_type` or conforming
redirect URIs) may help. (R-23.4-p, R-23.4-q, R-23.4-r)

  - A success body (valid JSON with a `client_id`) → `{ ok: true }`.
  - An HTTP failure status, or a body lacking `client_id`, → `{ ok: false }`
    with a human-readable `reason`; the client surfaces it (R-23.4-q) rather
    than crashing (R-23.4-p). `retryable` is `true` for redirect-URI/application
    -type rejections the client MAY retry (R-23.4-r).

## Parameters

### status

`number`

The registration endpoint's HTTP status.

### body

`unknown`

The raw response body.

## Returns

[`DynamicClientRegistrationResult`](../type-aliases/DynamicClientRegistrationResult.md)
