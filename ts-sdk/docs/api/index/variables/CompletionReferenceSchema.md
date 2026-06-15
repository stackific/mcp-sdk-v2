[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionReferenceSchema

# Variable: CompletionReferenceSchema

> `const` **CompletionReferenceSchema**: `ZodDiscriminatedUnion`\<`"type"`, \[`ZodObject`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `ZodObject`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>\]\>

Defined in: [protocol/completion.ts:236](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L236)

The closed `ref` discriminated union: a receiver MUST select the variant by
`ref.type` and MUST reject any other `type` value with `-32602`. (§19.3,
R-19.2-c – R-19.2-e, R-19.3-f)

`z.discriminatedUnion` over `type` is closed by construction: a `ref` whose
`type` is neither `"ref/prompt"` nor `"ref/resource"` fails to parse.
