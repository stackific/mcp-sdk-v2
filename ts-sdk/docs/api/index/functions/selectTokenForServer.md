[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / selectTokenForServer

# Function: selectTokenForServer()

> **selectTokenForServer**(`options`): [`TokenSelectionResult`](../type-aliases/TokenSelectionResult.md)

Defined in: [protocol/authorization-flow.ts:1481](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1481)

Selects the access token a client may send to a given MCP server — strictly the
one issued by that server's authorization server for that server, and no other.
(R-23.6-i)

Looks up the token recorded for `serverIssuer` and confirms its audience is the
server's `serverCanonicalResource`. When no matching token exists, returns an
error so the client sends NOTHING rather than a wrong-audience token — a client
MUST NOT send any token other than one issued for that server (R-23.6-i).

## Parameters

### options

#### serverIssuer

`string`

The issuer of the server's authorization server.

#### serverCanonicalResource

`string`

The server's canonical resource id.

#### tokenIssuer

`string`

The issuer that minted the candidate token.

#### tokenAudience

`string` \| `string`[]

The candidate token's audience.

#### accessToken

`string`

The candidate access token.

## Returns

[`TokenSelectionResult`](../type-aliases/TokenSelectionResult.md)
