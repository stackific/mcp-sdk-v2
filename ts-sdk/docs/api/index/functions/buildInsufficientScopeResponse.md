[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildInsufficientScopeResponse

# Function: buildInsufficientScopeResponse()

> **buildInsufficientScopeResponse**(`options`): [`InsufficientScopeChallenge`](../interfaces/InsufficientScopeChallenge.md)

Defined in: [protocol/authorization.ts:472](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L472)

Builds an MCP server's `403 Forbidden` insufficient-scope response with a
`Bearer` `WWW-Authenticate` header. (R-23.1-aa – R-23.1-ad)

The header carries `error="insufficient_scope"`, the `scope` parameter, and a
`resource_metadata` parameter (R-23.1-ab); the caller SHOULD pass the union of
all scopes the operation needs so this is a single, complete challenge rather
than an incremental one (R-23.1-ac). `error_description` is emitted only when
supplied (R-23.1-ad).

## Parameters

### options

[`InsufficientScopeResponseOptions`](../interfaces/InsufficientScopeResponseOptions.md)

The required scopes, metadata URI, and OPTIONAL description.

## Returns

[`InsufficientScopeChallenge`](../interfaces/InsufficientScopeChallenge.md)

## Throws

When `scope` or `resourceMetadata` is empty.
