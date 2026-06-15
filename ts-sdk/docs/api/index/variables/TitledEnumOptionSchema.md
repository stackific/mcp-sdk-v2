[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TitledEnumOptionSchema

# Variable: TitledEnumOptionSchema

> `const` **TitledEnumOptionSchema**: `ZodObject`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `const`: `ZodString`; `title`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:167](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L167)

One option of a titled enum: the wire `const` value plus its display `title`.
Both are REQUIRED. (§20.4)

`const` is a reserved word in some contexts but a valid object key / Zod field;
it is quoted here for clarity.
