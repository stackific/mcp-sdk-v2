[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UntitledSingleSelectEnumSchema

# Variable: UntitledSingleSelectEnumSchema

> `const` **UntitledSingleSelectEnumSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; `default`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:186](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L186)

A single choice from a list of string values, with no separate display labels.
(§20.4, `UntitledSingleSelectEnumSchema`)

  - `type` REQUIRED; MUST be `"string"`.
  - `enum` REQUIRED `string[]`; the values to choose from.
  - `title` / `description` OPTIONAL; `default` OPTIONAL string. (R-20.4-c)
