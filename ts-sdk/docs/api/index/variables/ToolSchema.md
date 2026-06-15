[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolSchema

# Variable: ToolSchema

> `const` **ToolSchema**: `ZodEffects`\<`ZodObject`\<`object` & `object`, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/tools.ts:547](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L547)

Schema for a single `Tool` definition. (§16.3)

Extends `BaseMetadata` (name REQUIRED, title OPTIONAL — S20) with the schema
and display fields. `inputSchema` is REQUIRED and its root `type` MUST be
`"object"` (enforced by `superRefine`, R-16.3-k / R-16.4-d). `outputSchema`,
`annotations`, `icons`, and `_meta` are OPTIONAL. `annotations` is the
untrusted `ToolAnnotations` hints object whose field SEMANTICS are owned by
S25; here it is accepted as an open record (`.passthrough()`), with its known
fields (`title`, `readOnlyHint`, `destructiveHint`, `idempotentHint`,
`openWorldHint`) documented for callers. (R-16.3-a, R-16.3-i – R-16.3-p)
