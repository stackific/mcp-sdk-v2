[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JSONRPCResultResponseSchema

# Variable: JSONRPCResultResponseSchema

> `const` **JSONRPCResultResponseSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `result`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `result`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `result`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/framing.ts:94](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L94)

A success response carries `jsonrpc`, `id`, and `result`.
The `result` shape (the `Result` base type) is defined in S04. (§3.5.1)
