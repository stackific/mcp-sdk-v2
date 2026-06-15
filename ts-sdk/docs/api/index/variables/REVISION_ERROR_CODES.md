[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / REVISION\_ERROR\_CODES

# Variable: REVISION\_ERROR\_CODES

> `const` **REVISION\_ERROR\_CODES**: `ReadonlySet`\<`number`\>

Defined in: [transport/http/responses.ts:438](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/responses.ts#L438)

The set of JSON-RPC error codes a *modern* server of this revision returns
with HTTP `400` at the transport boundary — the codes a dual-revision client
MUST recognize before deciding to fall back. (§9.12) These are the
`HeaderMismatch` (`-32001`), `MissingRequiredClientCapability` (`-32003`),
`UnsupportedProtocolVersion` (`-32004`), and the base validation codes.
