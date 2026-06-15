[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isResourceTemplateReference

# Function: isResourceTemplateReference()

> **isResourceTemplateReference**(`ref`): `ref is objectOutputType<{ type: ZodLiteral<"ref/resource">; uri: ZodString }, ZodTypeAny, "passthrough">`

Defined in: [protocol/completion.ts:249](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L249)

Returns `true` when `ref` is a [ResourceTemplateReference](../type-aliases/ResourceTemplateReference.md). (R-19.2-d)

## Parameters

### ref

`objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>

## Returns

`ref is objectOutputType<{ type: ZodLiteral<"ref/resource">; uri: ZodString }, ZodTypeAny, "passthrough">`
