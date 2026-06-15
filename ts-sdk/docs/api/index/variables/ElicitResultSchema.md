[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitResultSchema

# Variable: ElicitResultSchema

> `const` **ElicitResultSchema**: `ZodObject`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:360](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L360)

`ElicitResult` — client response to an `"elicitation/create"` input request.
Full shape is defined in §20 (S30/S31); the S17-owned constraint is the
`action` discriminator. (R-11.4-e)
