[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolAnnotationsSchema

# Variable: ToolAnnotationsSchema

> `const` **ToolAnnotationsSchema**: `ZodObject`\<\{ `title`: `ZodOptional`\<`ZodString`\>; `readOnlyHint`: `ZodOptional`\<`ZodBoolean`\>; `destructiveHint`: `ZodOptional`\<`ZodBoolean`\>; `idempotentHint`: `ZodOptional`\<`ZodBoolean`\>; `openWorldHint`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `title`: `ZodOptional`\<`ZodString`\>; `readOnlyHint`: `ZodOptional`\<`ZodBoolean`\>; `destructiveHint`: `ZodOptional`\<`ZodBoolean`\>; `idempotentHint`: `ZodOptional`\<`ZodBoolean`\>; `openWorldHint`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `title`: `ZodOptional`\<`ZodString`\>; `readOnlyHint`: `ZodOptional`\<`ZodBoolean`\>; `destructiveHint`: `ZodOptional`\<`ZodBoolean`\>; `idempotentHint`: `ZodOptional`\<`ZodBoolean`\>; `openWorldHint`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools-call.ts:502](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L502)

`ToolAnnotations` — OPTIONAL, UNTRUSTED, human- and model-oriented hints about
a tool's behavior. Attached to a `Tool` (the `Tool` envelope and its open
`annotations` record are defined in S24); this schema gives the five known
hint fields their explicit shapes and defaults. (§16.7)

Every field is OPTIONAL; the spec defaults (`readOnlyHint: false`,
`destructiveHint: true`, `idempotentHint: false`, `openWorldHint: true`) are
applied by [resolveToolAnnotationHints](../functions/resolveToolAnnotationHints.md), NOT by Zod (the wire shape keeps
absent fields absent). `.passthrough()` preserves forward-compatible additions.
(R-16.7-a – R-16.7-e)
