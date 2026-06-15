[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AuthorizationResponseParams

# Interface: AuthorizationResponseParams

Defined in: [protocol/authorization-flow.ts:936](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L936)

The redirect query parameters the authorization server returns. (§23.5, §23.7)

On success `code` is present; `state` echoes the request `state`; `iss`
identifies the authorization server (SHOULD; R-23.5-k). On error, `error` and
the optional `error_description`/`error_uri` are present and MUST NOT be acted
on when `iss` validation fails (R-23.7-h).

## Properties

### code?

> `optional` **code?**: `string`

Defined in: [protocol/authorization-flow.ts:938](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L938)

The authorization code to redeem (success).

***

### state?

> `optional` **state?**: `string`

Defined in: [protocol/authorization-flow.ts:940](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L940)

Echo of the request `state` (present if sent). (R-23.5-h)

***

### iss?

> `optional` **iss?**: `string`

Defined in: [protocol/authorization-flow.ts:942](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L942)

The authorization server's issuer identifier (SHOULD). (R-23.5-k, R-23.7-b)

***

### error?

> `optional` **error?**: `string`

Defined in: [protocol/authorization-flow.ts:944](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L944)

Error code (error responses).

***

### error\_description?

> `optional` **error\_description?**: `string`

Defined in: [protocol/authorization-flow.ts:946](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L946)

OPTIONAL human-readable error description.

***

### error\_uri?

> `optional` **error\_uri?**: `string`

Defined in: [protocol/authorization-flow.ts:948](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L948)

OPTIONAL URI with error information.
