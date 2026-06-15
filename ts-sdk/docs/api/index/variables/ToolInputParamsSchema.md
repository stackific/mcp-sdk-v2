[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolInputParamsSchema

# Variable: ToolInputParamsSchema

> `const` **ToolInputParamsSchema**: `ZodObject`\<\{ `arguments`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `arguments`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `arguments`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:478](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L478)

`ToolInputParams` — params of `ui/notifications/tool-input` and, identically,
`ui/notifications/tool-input-partial`. Carries the complete (or, for the
partial variant, a streaming snapshot of) tool arguments. (§26.5.2)
