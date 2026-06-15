[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CallToolRetryConfig

# Interface: CallToolRetryConfig

Defined in: [protocol/tools-call.ts:157](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L157)

The caller-supplied inputs to a retry of a previously `input_required` call.

## Properties

### name

> **name**: `string`

Defined in: [protocol/tools-call.ts:159](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L159)

REQUIRED tool name (same tool being retried). (R-16.5-a)

***

### inputResponses

> **inputResponses**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools-call.ts:165](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L165)

REQUIRED responses keyed by the prior result's `inputRequests` keys. For each
key in that result's `inputRequests`, the same key MUST appear here with its
response. (R-16.5-f, R-16.5-g)

***

### requestState?

> `optional` **requestState?**: `string`

Defined in: [protocol/tools-call.ts:171](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L171)

OPTIONAL opaque continuation token from the server's `input_required` result.
It is echoed back VERBATIM — never derived, parsed, or mutated. (R-16.5-h,
R-16.5-i, R-16.5-j)

***

### \_meta?

> `optional` **\_meta?**: `Record`\<`string`, `unknown`\>

Defined in: [protocol/tools-call.ts:173](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L173)

OPTIONAL additional `_meta` members. (R-16.5-k)
