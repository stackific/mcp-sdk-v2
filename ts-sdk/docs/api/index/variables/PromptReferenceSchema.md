[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PromptReferenceSchema

# Variable: PromptReferenceSchema

> `const` **PromptReferenceSchema**: `ZodObject`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:192](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L192)

A reference to a prompt being completed. Discriminator: `type === "ref/prompt"`.
(§19.3)

  - `type` REQUIRED, MUST equal the exact string `"ref/prompt"`. (R-19.3-a)
  - `name` REQUIRED — the programmatic name of the prompt (per S28). (R-19.3-b)
  - `title` OPTIONAL — human-readable display name; NOT load-bearing for
    matching.

`.passthrough()` preserves forward-compatible additions.
