[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResourceTemplateReferenceSchema

# Variable: ResourceTemplateReferenceSchema

> `const` **ResourceTemplateReferenceSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:217](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L217)

A reference to a resource or resource template whose variable is being
completed. Discriminator: `type === "ref/resource"`. (§19.3)

  - `type` REQUIRED, MUST equal the exact string `"ref/resource"`. (R-19.3-c)
  - `uri` REQUIRED — the URI or URI template (per S26). It MAY be a literal URI
    or a URI template containing `{…}` variables; when it is a template,
    `argument.name` identifies the variable being completed. (R-19.3-d,
    R-19.3-e)

`.passthrough()` preserves forward-compatible additions.
