[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptsCapabilitySchema

# Variable: PromptsCapabilitySchema

> `const` **PromptsCapabilitySchema**: `ZodObject`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/prompts.ts:119](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L119)

The value of the `prompts` key in a server's declared capabilities; presence of
the key declares the feature. (§18.1, R-18.1-a)

`listChanged` (OPTIONAL boolean): when `true`, the server MAY emit
`notifications/prompts/list_changed` when its prompt set changes. When absent or
`false`, the server MUST NOT be expected to emit it and a client MUST NOT rely
on receiving it. (R-18.1-c – R-18.1-f)

Both forms — present `{ listChanged }` and bare `{}` — are accepted (AC-28.4).
`.passthrough()` preserves forward-compatible additions. The exact shape mirrors
the `prompts` field already declared in `ServerCapabilitiesSchema` (S10); this
schema lets a server build/validate that capability value standalone.
