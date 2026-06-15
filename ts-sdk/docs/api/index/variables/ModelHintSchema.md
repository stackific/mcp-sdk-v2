[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ModelHintSchema

# Variable: ModelHintSchema

> `const` **ModelHintSchema**: `ZodObject`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `name`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/sampling.ts:242](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L242)

`ModelHint` — a single advisory hint toward a model. (§21.2.9)

`name` is OPTIONAL; the client SHOULD treat it as a substring of a model name
and MAY map it to a different provider's model or a similar-niche family.
Keys other than `name` are unspecified. (R-21.2.9-f, R-21.2.9-g)
