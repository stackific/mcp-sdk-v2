[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolsCallParamsSchema

# Variable: ToolsCallParamsSchema

> `const` **ToolsCallParamsSchema**: `ZodObject`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:525](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L525)

`ToolsCallParams` — params of the UI-initiated `tools/call` request, reusing
the core §16 tool-call shape. (§26.5.3)
