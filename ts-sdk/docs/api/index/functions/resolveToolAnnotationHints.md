[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveToolAnnotationHints

# Function: resolveToolAnnotationHints()

> **resolveToolAnnotationHints**(`annotations`): [`ResolvedToolAnnotationHints`](../interfaces/ResolvedToolAnnotationHints.md)

Defined in: [protocol/tools-call.ts:550](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L550)

Resolves the four boolean `ToolAnnotations` hints to concrete values, applying
the §16.7 defaults for any absent field: `readOnlyHint` ⇒ `false`,
`destructiveHint` ⇒ `true`, `idempotentHint` ⇒ `false`, `openWorldHint` ⇒
`true`. (R-16.7-b, R-16.7-c, R-16.7-d, R-16.7-e)

Note `destructiveHint` and `idempotentHint` are meaningful only when
`readOnlyHint` is `false`; callers SHOULD ignore them otherwise.

## Parameters

### annotations

`objectOutputType`\<\{ `title`: `ZodOptional`\<`ZodString`\>; `readOnlyHint`: `ZodOptional`\<`ZodBoolean`\>; `destructiveHint`: `ZodOptional`\<`ZodBoolean`\>; `idempotentHint`: `ZodOptional`\<`ZodBoolean`\>; `openWorldHint`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The (possibly partial / absent) annotations object.

## Returns

[`ResolvedToolAnnotationHints`](../interfaces/ResolvedToolAnnotationHints.md)
