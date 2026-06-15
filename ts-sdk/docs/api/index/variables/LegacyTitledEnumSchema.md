[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / LegacyTitledEnumSchema

# ~~Variable: LegacyTitledEnumSchema~~

> `const` **LegacyTitledEnumSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `enumNames`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `enumNames`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `enumNames`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:306](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L306)

Deprecated legacy titled enum: per-value display labels via a parallel
`enumNames` array, non-standard for JSON Schema 2020-12. Implementations
SHOULD NOT adopt it for new functionality; it remains defined only for
interoperability (a peer MAY still send it). Use
[TitledSingleSelectEnumSchema](TitledSingleSelectEnumSchema.md) for per-option labels in new work.
(§20.4, R-20.4-f, R-20.4-g)

  - `type` REQUIRED; MUST be `"string"`.
  - `enum` REQUIRED `string[]`; the values to choose from.
  - `enumNames` OPTIONAL `string[]`; display names, positionally aligned.
  - `title` / `description` OPTIONAL; `default` OPTIONAL string. (R-20.4-c)

## Deprecated

Use [TitledSingleSelectEnumSchema](TitledSingleSelectEnumSchema.md) for per-option labels
  in new functionality. (R-20.4-f, R-20.4-g)
