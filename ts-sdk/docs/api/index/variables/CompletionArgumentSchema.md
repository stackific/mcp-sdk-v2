[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionArgumentSchema

# Variable: CompletionArgumentSchema

> `const` **CompletionArgumentSchema**: `ZodObject`\<\{ `name`: `ZodString`; `value`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodString`; `value`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodString`; `value`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:268](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L268)

The single argument being completed. (§19.2)

  - `name` REQUIRED — the name of the argument (a prompt argument name or a
    URI-template variable name). (R-19.2-g)
  - `value` REQUIRED — the current partial value entered by the user; the match
    seed. MAY be the empty string `""` (the server then returns suggestions
    appropriate to empty input). (R-19.2-h, R-19.2-i)

`.passthrough()` preserves forward-compatible additions.
