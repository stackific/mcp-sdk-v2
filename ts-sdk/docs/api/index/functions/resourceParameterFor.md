[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resourceParameterFor

# Function: resourceParameterFor()

> **resourceParameterFor**(`canonicalResourceIdentifier`): `string`

Defined in: [protocol/authorization-flow.ts:1425](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1425)

Returns the `resource` parameter value for the MCP server — its canonical
resource identifier — that MUST be sent in BOTH the authorization and token
requests, regardless of whether the authorization server advertises `resource`
support. (R-23.6-b, R-23.6-c, R-23.6-d, R-23.6-e)

This is the identity of the canonical resource identifier; it is surfaced as a
named helper so call sites read intentionally and the "always send it" rule
(R-23.6-e) is explicit. The value SHOULD already be a canonical resource
identifier (validate with S35's `isValidCanonicalResourceIdentifier`).

## Parameters

### canonicalResourceIdentifier

`string`

The MCP server's canonical resource id.

## Returns

`string`
