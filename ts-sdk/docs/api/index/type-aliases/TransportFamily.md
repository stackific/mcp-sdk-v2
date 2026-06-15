[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TransportFamily

# Type Alias: TransportFamily

> **TransportFamily** = `"http"` \| `"stdio"` \| `"other"`

Defined in: [protocol/authorization.ts:56](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L56)

The transport families relevant to authorization applicability.

`http` is the Streamable HTTP transport of §9 — the only family §23 governs.
`stdio` is the §8 stdio transport, which MUST NOT use this flow. `other`
stands for any transport that is neither — it follows its own established
security best practices and is outside §23's scope. (R-23.1-a – R-23.1-c)
