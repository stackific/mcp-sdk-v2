[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DiscoverConfig

# Interface: DiscoverConfig

Defined in: [protocol/discovery.ts:212](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L212)

The server-supplied inputs to a `DiscoverResult`. A server constructs one of
these once and reuses it across discovery requests (the model is stateless —
the result does not depend on the connection or any prior request).

## Properties

### supportedVersions

> **supportedVersions**: readonly `string`[]

Defined in: [protocol/discovery.ts:214](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L214)

Non-empty list of revisions the server will accept. (R-5.3.2-b, R-5.3.2-c)

***

### capabilities

> **capabilities**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/discovery.ts:216](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L216)

The server's advertised capabilities; `{}` means "no optional capabilities".

***

### serverInfo

> **serverInfo**: `objectOutputType`

Defined in: [protocol/discovery.ts:218](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L218)

Server identity; MUST carry string `name` and `version`. (R-5.3.2-f)

***

### instructions?

> `optional` **instructions?**: `string`

Defined in: [protocol/discovery.ts:220](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L220)

OPTIONAL guidance for using the server effectively. (R-5.3.2-g)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/discovery.ts:222](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/discovery.ts#L222)

OPTIONAL result-level metadata. (R-5.3.2-k)
