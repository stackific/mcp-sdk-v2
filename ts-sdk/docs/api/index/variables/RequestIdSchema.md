[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestIdSchema

# Variable: RequestIdSchema

> `const` **RequestIdSchema**: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>

Defined in: [jsonrpc/framing.ts:23](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L23)

`RequestId` correlates a response with the request that originated it.

MUST be a JSON string or JSON number. MUST NOT be `null`. (R-3.2-a, R-3.2-b)
This is stricter than base JSON-RPC 2.0 which permits `null`.
