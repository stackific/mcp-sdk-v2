[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MalformedIdErrorResponseSchema

# Variable: MalformedIdErrorResponseSchema

> `const` **MalformedIdErrorResponseSchema**: `ZodObject`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>, `ZodNull`\]\>\>; `error`: `ZodObject`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>, `ZodNull`\]\>\>; `error`: `ZodObject`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `jsonrpc`: `ZodLiteral`\<`"2.0"`\>; `id`: `ZodOptional`\<`ZodUnion`\<\[`ZodUnion`\<\[`ZodString`, `ZodEffects`\<`ZodNumber`, `number`, `number`\>\]\>, `ZodNull`\]\>\>; `error`: `ZodObject`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [transport/correlation.ts:200](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/correlation.ts#L200)

Schema accepting an error response to an unreadable-id request: `id` may be a
string, a number, `null`, or omitted entirely. (R-7.2-h)

This deliberately relaxes S03's `JSONRPCErrorResponseSchema` (which permits
only string/number/omitted) to also allow the `null` form the transport layer
explicitly sanctions for this case.
