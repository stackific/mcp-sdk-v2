[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestDisplayModeParamsSchema

# Variable: RequestDisplayModeParamsSchema

> `const` **RequestDisplayModeParamsSchema**: `ZodObject`\<\{ `mode`: `ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `mode`: `ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `mode`: `ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:574](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L574)

`RequestDisplayModeParams` — params of `ui/request-display-mode`: the mode the
UI requests. (§26.5.3)
