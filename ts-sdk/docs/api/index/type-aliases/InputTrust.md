[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputTrust

# Type Alias: InputTrust

> **InputTrust** = `"trusted"` \| `"untrusted"`

Defined in: [protocol/security.ts:444](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L444)

Classification of an input's trust, the §28 trust-boundary primitive: anything a
peer supplies (a tool definition, annotation, metadata field, cursor, URI,
schema) is `untrusted` unless it came from a server the host explicitly trusts.
(§28.1, §28.3, R-28.1-i, R-28.3-b)
