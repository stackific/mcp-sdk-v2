[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitationInputRequestSchema

# Variable: ElicitationInputRequestSchema

> `const` **ElicitationInputRequestSchema**: `ZodObject`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `method`: `ZodLiteral`\<`"elicitation/create"`\>; `params`: `ZodRecord`\<`ZodString`, `ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/multi-round-trip.ts:63](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/multi-round-trip.ts#L63)

An `"elicitation/create"` input request. (§11.2, §20 / S30-S31)
The full `params` shape (`ElicitRequestParams`) is defined in S30/S31;
here it is accepted as any JSON object.
