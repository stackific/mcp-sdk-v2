[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JSONRPCErrorResponseSchema

# Variable: JSONRPCErrorResponseSchema

> `const` **JSONRPCErrorResponseSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>\>; `error`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>\>; `error`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>\>; `error`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/framing.ts:118](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L118)

An error response carries `jsonrpc`, a required `error` object, and an
optional `id`. The `id` MUST be set to the originating request's identifier
when known; it MAY be omitted only when the identifier cannot be determined
(e.g. unparseable JSON). (§3.5.2, R-3.5.2-a – R-3.5.2-f)

The `Error` object shape and standard error-code constants are defined in S04.
