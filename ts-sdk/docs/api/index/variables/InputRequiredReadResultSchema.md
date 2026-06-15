[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InputRequiredReadResultSchema

# Variable: InputRequiredReadResultSchema

> `const` **InputRequiredReadResultSchema**: `ZodObject`\<\{ `resultType`: `ZodLiteral`\<`"input_required"`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resultType`: `ZodLiteral`\<`"input_required"`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resultType`: `ZodLiteral`\<`"input_required"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/resources-read.ts:339](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources-read.ts#L339)

The `input_required` variant a server MAY return from `resources/read` instead
of a [ReadResourceResultSchema](ReadResourceResultSchema.md), signalling it needs additional client
input before the resource can be read. The full multi-round-trip payload
shape (`inputRequests` / `requestState`) is owned by §11 / S17; here we fix
only the discriminator so a caller can branch on it. (§17.5, R-17.5-w)

`.passthrough()` preserves the S17-owned members.
