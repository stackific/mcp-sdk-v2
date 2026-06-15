[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolsCapabilitySchema

# Variable: ToolsCapabilitySchema

> `const` **ToolsCapabilitySchema**: `ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools.ts:81](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L81)

`ToolsCapability` — the value of the `tools` key inside a server's
capabilities object. Declares the server exposes tools and OPTIONALLY that it
emits list-changed notifications. (§16.1, R-16.1-a, R-16.1-b)

`listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
`notifications/tools/list_changed` when its tool set changes; absent or
`false` means it does not. `.passthrough()` preserves forward-compatible
additions. (Mirrors the `tools` shape in `ServerCapabilitiesSchema`, S10.)
