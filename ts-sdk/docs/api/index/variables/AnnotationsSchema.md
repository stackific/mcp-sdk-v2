[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / AnnotationsSchema

# Variable: AnnotationsSchema

> `const` **AnnotationsSchema**: `ZodObject`\<\{ `audience`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"user"`, `"assistant"`\]\>, `"many"`\>\>; `priority`: `ZodOptional`\<`ZodNumber`\>; `lastModified`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `audience`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"user"`, `"assistant"`\]\>, `"many"`\>\>; `priority`: `ZodOptional`\<`ZodNumber`\>; `lastModified`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `audience`: `ZodOptional`\<`ZodArray`\<`ZodEnum`\<\[`"user"`, `"assistant"`\]\>, `"many"`\>\>; `priority`: `ZodOptional`\<`ZodNumber`\>; `lastModified`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [types/annotations.ts:19](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/annotations.ts#L19)

Optional hints about a piece of content or a resource. (§14.6, R-14.6-a)

All fields are OPTIONAL; an absent or empty `Annotations` object is valid.
`.passthrough()` allows forward-compatible protocol extensions.
