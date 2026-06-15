[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateTokenAudience

# Function: validateTokenAudience()

> **validateTokenAudience**(`tokenAudience`, `ownCanonicalResource`): [`TokenAudienceValidation`](../type-aliases/TokenAudienceValidation.md)

Defined in: [protocol/authorization-flow.ts:1445](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1445)

Validates, on the MCP server side, that a presented token was issued for THIS
server as the intended audience, rejecting any token whose audience is some
other resource. (R-23.6-f, R-23.6-g, R-23.6-h)

Compares the token's audience to this server's canonical resource identifier
using S35's `resourceIdentifiersEqual` (accepting uppercase scheme/host for
robustness, R-23.1-p). A server MUST only accept tokens valid for its own
resources and MUST NOT accept (or forward) any other token (R-23.6-h).

## Parameters

### tokenAudience

`string` \| `string`[]

The audience claim (`aud`) the token carries.

### ownCanonicalResource

`string`

This server's canonical resource identifier.

## Returns

[`TokenAudienceValidation`](../type-aliases/TokenAudienceValidation.md)
