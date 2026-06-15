[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionContextSchema

# Variable: CompletionContextSchema

> `const` **CompletionContextSchema**: `ZodObject`\<\{ `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:289](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L289)

Additional completion context. (§19.2)

  - `arguments` OPTIONAL map<string,string> — already-resolved sibling
    argument values used to disambiguate/refine suggestions. Its keys MUST NOT
    include the argument named in `argument.name`. (R-19.2-j, R-19.2-k)

A server MAY ignore `context` entirely. (R-19.2-l) `.passthrough()` preserves
forward-compatible additions.
