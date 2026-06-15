[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayForwardTokenToServer

# Function: mayForwardTokenToServer()

> **mayForwardTokenToServer**(`tokenIssuer`, `serverIssuer`): `boolean`

Defined in: [protocol/authorization-registration.ts:1041](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L1041)

Returns `true` when a client MAY send the access token it holds for
`tokenIssuer` to the MCP server whose authorization server is `serverIssuer` —
strictly only when the issuers match exactly. A client MUST NOT send a token to
an MCP server other than one issued by that server's authorization server.
(R-23.19-c)

## Parameters

### tokenIssuer

`string`

The issuer that minted the token the client holds.

### serverIssuer

`string`

The issuer of the target server's authorization server.

## Returns

`boolean`
