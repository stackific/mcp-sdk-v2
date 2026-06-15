[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / StrictElicitResultSchema

# Variable: StrictElicitResultSchema

> `const` **StrictElicitResultSchema**: `ZodObject`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodString`, `"many"`\>\]\>\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodString`, `"many"`\>\]\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `action`: `ZodEnum`\<\[`"accept"`, `"decline"`, `"cancel"`\]\>; `content`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodString`, `"many"`\>\]\>\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation-form.ts:628](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L628)

A stricter `ElicitResult` schema that also enforces the §20.5 `content` value
typing (string | number | boolean | string[]) — the S17 `ElicitResultSchema`
accepts any `content` record so it can carry the result before this story pins
the value types. (§20.5, R-20.5-a, R-20.5-c)

Parsing through this schema additionally rejects a `content` value of a
disallowed type (e.g. an object, `null`, or a mixed array). It does NOT, on its
own, enforce mode-correlation (content only on form-mode accept) or schema
conformance — use [validateElicitResult](../functions/validateElicitResult.md) for those.
