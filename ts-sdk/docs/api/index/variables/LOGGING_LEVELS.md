[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LOGGING\_LEVELS

# Variable: LOGGING\_LEVELS

> `const` **LOGGING\_LEVELS**: readonly \[`"debug"`, `"info"`, `"notice"`, `"warning"`, `"error"`, `"critical"`, `"alert"`, `"emergency"`\]

Defined in: [protocol/meta.ts:94](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L94)

Log severity values, in ascending order. (§4.3, R-4.3-d)

Used in `io.modelcontextprotocol/logLevel`. Status: **Deprecated** (see §15 / S23).
When present, the server SHOULD emit only log notifications at or above this
severity. When absent, the server MUST NOT emit log notifications for the
request (R-4.3-l, R-4.3-m).
