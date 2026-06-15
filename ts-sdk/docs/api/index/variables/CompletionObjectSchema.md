[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionObjectSchema

# Variable: CompletionObjectSchema

> `const` **CompletionObjectSchema**: `ZodObject`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `values`: `ZodArray`\<`ZodString`, `"many"`\>; `total`: `ZodOptional`\<`ZodNumber`\>; `hasMore`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/completion.ts:385](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L385)

The `completion` object wrapping the ranked suggestions. (§19.4)

  - `values` REQUIRED `string[]` — candidate values ranked by DESCENDING
    relevance (most relevant first). MUST NOT exceed 100 items; MAY be empty.
    (R-19.4-b, R-19.4-c, R-19.5-c)
  - `total` OPTIONAL number — total matching options available; MAY exceed
    `values.length`; unknown when omitted. (R-19.4-f, R-19.4-h)
  - `hasMore` OPTIONAL boolean — whether more matches exist beyond `values`;
    clients treat omission as `false`. (R-19.4-e, R-19.4-i)

The 100-item cap is enforced by `.max(MAX_COMPLETION_VALUES)` so a result that
over-fills `values` fails to parse. `.passthrough()` preserves additions.
