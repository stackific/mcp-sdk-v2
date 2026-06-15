[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / WwwAuthenticateChallenge

# Interface: WwwAuthenticateChallenge

Defined in: [protocol/authorization.ts:353](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L353)

The structured fields of a `Bearer` `WWW-Authenticate` challenge.

Not a JSON object — the parameter set carried in the HTTP response header. On
a `401` (§7.4) `resourceMetadata` is REQUIRED and `scope` SHOULD be present;
on a `403` insufficient-scope challenge (§7.5) `error` is `"insufficient_scope"`
and `scope`, `resourceMetadata`, and an OPTIONAL `errorDescription` accompany
it. (R-23.1-v, R-23.1-w, R-23.1-ab, R-23.1-ad)

## Properties

### scheme

> **scheme**: `"Bearer"`

Defined in: [protocol/authorization.ts:355](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L355)

The authentication scheme; always `Bearer` for MCP. (R-23.1-u)

***

### resourceMetadata?

> `optional` **resourceMetadata?**: `string`

Defined in: [protocol/authorization.ts:357](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L357)

Absolute URI of the protected-resource metadata document. (R-23.1-v)

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization.ts:359](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L359)

Space-delimited scopes required for the operation. (R-23.1-w, R-23.1-ab)

***

### error?

> `optional` **error?**: `string`

Defined in: [protocol/authorization.ts:361](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L361)

The failure code; `"insufficient_scope"` on a `403`. (R-23.1-ab)

***

### errorDescription?

> `optional` **errorDescription?**: `string`

Defined in: [protocol/authorization.ts:363](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L363)

OPTIONAL human-readable description of the failure. (R-23.1-ad)
