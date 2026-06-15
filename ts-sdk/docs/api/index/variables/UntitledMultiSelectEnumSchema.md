[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UntitledMultiSelectEnumSchema

# Variable: UntitledMultiSelectEnumSchema

> `const` **UntitledMultiSelectEnumSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"array"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minItems`: `ZodOptional`\<`ZodNumber`\>; `maxItems`: `ZodOptional`\<`ZodNumber`\>; `items`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `default`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"array"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minItems`: `ZodOptional`\<`ZodNumber`\>; `maxItems`: `ZodOptional`\<`ZodNumber`\>; `items`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `default`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"array"`\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minItems`: `ZodOptional`\<`ZodNumber`\>; `maxItems`: `ZodOptional`\<`ZodNumber`\>; `items`: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"string"`\>; `enum`: `ZodArray`\<`ZodString`, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>; `default`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:243](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L243)

Selection of zero or more values from a list, with no separate display labels.
(§20.4, `UntitledMultiSelectEnumSchema`)

  - `type` REQUIRED; MUST be the literal `"array"`.
  - `items` REQUIRED; `{ type: "string", enum: string[] }`.
  - `minItems` / `maxItems` OPTIONAL selection-count bounds.
  - `title` / `description` OPTIONAL; `default` OPTIONAL `string[]`. (R-20.4-c)
