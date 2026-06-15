[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SamplingToolSchema

# Variable: SamplingToolSchema

> `const` **SamplingToolSchema**: `ZodObject`\<\{ `name`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `inputSchema`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `inputSchema`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `description`: `ZodOptional`\<`ZodString`\>; `inputSchema`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/sampling.ts:375](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L375)

The minimal `Tool` shape accepted inside a sampling request's `tools[]`. The
canonical `Tool` is owned by S24/§16; here only the fields sampling depends on
are pinned (`name` plus an input-schema object), and `.passthrough()` keeps
the rest. These definitions are scoped to the request and need not correspond
to any registered server tool. (R-21.2.4-m)
