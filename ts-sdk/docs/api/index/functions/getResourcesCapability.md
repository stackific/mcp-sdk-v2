[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / getResourcesCapability

# Function: getResourcesCapability()

> **getResourcesCapability**(`caps`): `objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; `subscribe`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

Defined in: [protocol/resources.ts:607](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/resources.ts#L607)

Narrowing accessor: returns the `resources` capability object from a parsed
`ServerCapabilities`, or `undefined` when the server did not declare it.
(§17.1, R-17.1-a)

## Parameters

### caps

`objectOutputType`

## Returns

`objectOutputType`\<\{ `listChanged`: `ZodOptional`\<`ZodBoolean`\>; `subscribe`: `ZodOptional`\<`ZodBoolean`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`
