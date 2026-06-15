[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkResourceParameterBinding

# Function: checkResourceParameterBinding()

> **checkResourceParameterBinding**(`options`): [`ResourceBindingValidation`](../type-aliases/ResourceBindingValidation.md)

Defined in: [protocol/authorization-registration.ts:1011](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1011)

Validates the audience-binding requirement: the SAME `resource` parameter,
identifying the MCP server by its canonical URI, MUST be present in BOTH the
authorization request and the token request, regardless of advertised AS
support. (R-23.19-a)

A client MUST implement Resource Indicators by always sending `resource` in both
legs (R-23.19-a). This confirms both are present and byte-identical to
`canonicalResource`; S36's `assertResourceMatchesStep2` performs the equivalent
Step-2/Step-4 invariant, and is reused by callers that already hold the request
objects.

## Parameters

### options

#### authorizationRequestResource?

`string`

The `resource` sent in the
  authorization request. (R-23.19-a)

#### tokenRequestResource?

`string`

The `resource` sent in the token
  request. (R-23.19-a)

#### canonicalResource

`string`

The MCP server's canonical resource
  identifier both MUST equal.

## Returns

[`ResourceBindingValidation`](../type-aliases/ResourceBindingValidation.md)
