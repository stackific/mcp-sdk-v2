[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JSONRPCRequestSchema

# Variable: JSONRPCRequestSchema

> `const` **JSONRPCRequestSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/framing.ts:41](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L41)

A request carries `jsonrpc`, `id`, and `method`; it expects exactly one
matching response. (§3.3, R-3.3-a – R-3.3-i)

`params` is OPTIONAL and, when present, MUST be a JSON object (not an array).
`.passthrough()` lets future protocol extensions add fields without breaking
conformant receivers.
