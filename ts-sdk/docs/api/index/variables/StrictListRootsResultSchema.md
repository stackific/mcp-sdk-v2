[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StrictListRootsResultSchema

# Variable: StrictListRootsResultSchema

> `const` **StrictListRootsResultSchema**: `ZodObject`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/roots.ts:424](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L424)

The `ListRootsResult` a client supplies on retry, with §21.1 `Root`
validation. (§21.1.5; AC-32.10, AC-32.11)

⚠️ DEPRECATED. `roots` is REQUIRED; it MAY be empty (`[]`) to indicate no
exposed roots but MUST be present even when empty. (R-21.1.5-a · REQUIRED;
AC-32.10) Each entry MUST satisfy [RootSchema](RootSchema.md) (`file://` +
RFC 3986). (R-21.1.5-b, R-21.1.5-d; AC-32.11)

This is the STRICT form; the S17 `ListRootsResultSchema` (re-exported above)
is the lenient cross-cutting form that validates only the array's presence.
Use this when a receiver wants the full §21.1 `uri` enforcement.
