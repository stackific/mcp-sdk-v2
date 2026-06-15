[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / NumberSchemaSchema

# Variable: NumberSchemaSchema

> `const` **NumberSchemaSchema**: `ZodObject`\<\{ `type`: `ZodEnum`\<\[`"number"`, `"integer"`\]\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minimum`: `ZodOptional`\<`ZodNumber`\>; `maximum`: `ZodOptional`\<`ZodNumber`\>; `default`: `ZodOptional`\<`ZodNumber`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodEnum`\<\[`"number"`, `"integer"`\]\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minimum`: `ZodOptional`\<`ZodNumber`\>; `maximum`: `ZodOptional`\<`ZodNumber`\>; `default`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodEnum`\<\[`"number"`, `"integer"`\]\>; `title`: `ZodOptional`\<`ZodString`\>; `description`: `ZodOptional`\<`ZodString`\>; `minimum`: `ZodOptional`\<`ZodNumber`\>; `maximum`: `ZodOptional`\<`ZodNumber`\>; `default`: `ZodOptional`\<`ZodNumber`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:115](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L115)

A numeric field of a form-mode `requestedSchema`, integer or real, optionally
bounded. (§20.4)

  - `type` REQUIRED; MUST be `"number"` or `"integer"`. (R-20.4-e)
  - `title` / `description` OPTIONAL display strings.
  - `minimum` / `maximum` OPTIONAL inclusive bounds.
  - `default` OPTIONAL numeric pre-population value. (R-20.4-c)
