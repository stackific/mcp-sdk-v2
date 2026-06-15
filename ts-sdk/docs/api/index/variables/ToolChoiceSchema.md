[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ToolChoiceSchema

# Variable: ToolChoiceSchema

> `const` **ToolChoiceSchema**: `ZodObject`\<\{ `mode`: `ZodOptional`\<`ZodEnum`\<\[`"auto"`, `"required"`, `"none"`\]\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `mode`: `ZodOptional`\<`ZodEnum`\<\[`"auto"`, `"required"`, `"none"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `mode`: `ZodOptional`\<`ZodEnum`\<\[`"auto"`, `"required"`, `"none"`\]\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/sampling.ts:324](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/sampling.ts#L324)

`ToolChoice` — controls the model's tool-use behavior during sampling. (§21.2.5)

`mode` is OPTIONAL; the default when omitted is `{ "mode": "auto" }`.
(R-21.2.4-p) `"required"` means the model MUST use at least one tool before
completing (R-21.2.5-a); `"none"` means the model MUST NOT use any tools.
(R-21.2.5-b)
