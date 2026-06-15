[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / BooleanSchemaSchema

# Variable: BooleanSchemaSchema

> `const` **BooleanSchemaSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"boolean"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `default`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"boolean"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `default`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"boolean"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `default`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:143](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L143)

A true/false field of a form-mode `requestedSchema`. (§20.4)

  - `type` REQUIRED; MUST be the literal `"boolean"`.
  - `title` / `description` OPTIONAL display strings.
  - `default` OPTIONAL boolean pre-population value. (R-20.4-c)
