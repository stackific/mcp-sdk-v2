[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StringSchemaSchema

# Variable: StringSchemaSchema

> `const` **StringSchemaSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minLength`: `ZodOptional`\<`ZodNumber`\>; `maxLength`: `ZodOptional`\<`ZodNumber`\>; `format`: `ZodOptional`\<`ZodEnum`\<\[`"email"`, `"uri"`, `"date"`, `"date-time"`\]\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minLength`: `ZodOptional`\<`ZodNumber`\>; `maxLength`: `ZodOptional`\<`ZodNumber`\>; `format`: `ZodOptional`\<`ZodEnum`\<\[`"email"`, `"uri"`, `"date"`, `"date-time"`\]\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minLength`: `ZodOptional`\<`ZodNumber`\>; `maxLength`: `ZodOptional`\<`ZodNumber`\>; `format`: `ZodOptional`\<`ZodEnum`\<\[`"email"`, `"uri"`, `"date"`, `"date-time"`\]\>\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:77](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L77)

A free-text field of a form-mode `requestedSchema`, optionally length-bounded
and format-hinted. (§20.4)

  - `type` REQUIRED; MUST be the literal `"string"`.
  - `title` / `description` OPTIONAL display strings.
  - `minLength` / `maxLength` OPTIONAL numeric length bounds.
  - `format` OPTIONAL; when present MUST be one of `"email"`, `"uri"`, `"date"`,
    `"date-time"`. (R-20.4-d)
  - `default` OPTIONAL string pre-population value. (R-20.4-c)

Note: this is the FREE-TEXT string schema — it carries no `enum`/`oneOf`, which
is what structurally distinguishes it from the string-typed enum members. The
presence of `enum`/`oneOf` selects an [EnumSchema](../type-aliases/EnumSchema.md) member instead.
