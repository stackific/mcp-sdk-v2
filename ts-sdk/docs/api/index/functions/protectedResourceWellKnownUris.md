[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / protectedResourceWellKnownUris

# Function: protectedResourceWellKnownUris()

> **protectedResourceWellKnownUris**(`endpointUrl`): `string`[]

Defined in: [protocol/authorization.ts:682](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L682)

Builds the ordered list of protected-resource-metadata well-known URIs to try
for an MCP server endpoint, when no `resource_metadata` header URI is
available. (R-23.2-e, R-23.2-f)

The order MUST be:
  1. path-aware insertion — `https://<host>/.well-known/oauth-protected-resource/<path>`;
  2. root — `https://<host>/.well-known/oauth-protected-resource`.
When the endpoint has no path beyond `/`, the path-aware form coincides with
the root form and only the root URI is returned (no duplicate).

## Parameters

### endpointUrl

`string`

The MCP server's endpoint URL.

## Returns

`string`[]

## Throws

When `endpointUrl` is not an absolute URI.
