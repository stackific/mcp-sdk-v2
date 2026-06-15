[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUnauthorizedResponse

# Function: buildUnauthorizedResponse()

> **buildUnauthorizedResponse**(`options`): [`UnauthorizedChallenge`](../interfaces/UnauthorizedChallenge.md)

Defined in: [protocol/authorization.ts:433](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L433)

Builds an MCP server's `401 Unauthorized` response with a `Bearer`
`WWW-Authenticate` header. (R-23.1-t, R-23.1-u, R-23.1-v, R-23.1-w)

The header always carries the REQUIRED `resource_metadata` parameter
(R-23.1-v) and SHOULD carry `scope` when the server can determine the required
scopes (R-23.1-w). This `401` is an HTTP-layer response distinct from §22's
JSON-RPC error codes and carries no JSON-RPC error body.

## Parameters

### options

[`UnauthorizedResponseOptions`](../interfaces/UnauthorizedResponseOptions.md)

The required metadata URI and OPTIONAL required scopes.

## Returns

[`UnauthorizedChallenge`](../interfaces/UnauthorizedChallenge.md)

## Throws

When `resourceMetadata` is empty — it is REQUIRED.
