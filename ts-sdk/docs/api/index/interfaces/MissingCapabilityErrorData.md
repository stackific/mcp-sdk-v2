[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MissingCapabilityErrorData

# Interface: MissingCapabilityErrorData

Defined in: [protocol/meta.ts:292](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L292)

The `data` payload for a `-32003` "Missing required client capability" error.
(§5 / S09, R-4.3-k)

## Properties

### requiredCapabilities

> **requiredCapabilities**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/meta.ts:294](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L294)

Keys are the capability names the request required but did not declare.
