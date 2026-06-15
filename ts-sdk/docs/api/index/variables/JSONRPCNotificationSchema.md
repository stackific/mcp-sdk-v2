[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / JSONRPCNotificationSchema

# Variable: JSONRPCNotificationSchema

> `const` **JSONRPCNotificationSchema**: `ZodEffects`\<`ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `method`: `ZodString`; `params`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/framing.ts:64](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L64)

A notification carries `jsonrpc` and `method` but NO `id`. It is one-way:
a receiver MUST NOT send any response to it, even if it is malformed or
the method is unrecognized. (§3.4, R-3.4-a – R-3.4-f)
