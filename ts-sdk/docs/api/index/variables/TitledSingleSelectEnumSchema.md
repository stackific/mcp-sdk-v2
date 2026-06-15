[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TitledSingleSelectEnumSchema

# Variable: TitledSingleSelectEnumSchema

> `const` **TitledSingleSelectEnumSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `oneOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `oneOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `oneOf`: `ZodArray`\<`ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:211](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L211)

A single choice where each option carries a separate display label.
(§20.4, `TitledSingleSelectEnumSchema`)

SHOULD be used when per-option display labels are needed, in preference to the
Deprecated `enumNames` form. (R-20.4-g)

  - `type` REQUIRED; MUST be `"string"`.
  - `oneOf` REQUIRED; one `{ const, title }` entry per selectable option.
  - `title` / `description` OPTIONAL; `default` OPTIONAL (a member of the
    option `const`s). (R-20.4-c)
