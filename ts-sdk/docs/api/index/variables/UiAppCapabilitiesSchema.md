[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiAppCapabilitiesSchema

# Variable: UiAppCapabilitiesSchema

> `const` **UiAppCapabilitiesSchema**: `ZodObject`\<\{ `experimental`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `tools`: `ZodOptional`\<`ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `availableDisplayModes`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `experimental`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `tools`: `ZodOptional`\<`ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `availableDisplayModes`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `experimental`: `ZodOptional`\<`ZodObject`\<\{ \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `tools`: `ZodOptional`\<`ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>\>; `availableDisplayModes`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"inline"`, `"fullscreen"`, `"pip"`\]\>, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui-host.ts:266](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L266)

Capabilities the UI offers, declared in `ui/initialize.params.appCapabilities`.
(§26.5.1) All members OPTIONAL; `.passthrough()` preserves forward-compatible
members.
