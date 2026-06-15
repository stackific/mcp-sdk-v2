[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / promptArgumentNamesOf

# Function: promptArgumentNamesOf()

> **promptArgumentNamesOf**(`prompt`): `string`[]

Defined in: [protocol/completion.ts:779](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L779)

Returns the declared argument names of a `Prompt` for use in a
[CompletionCatalog](../interfaces/CompletionCatalog.md). Reuses the S28 `PromptArgument` shape (NOT
redefined). A prompt with no `arguments` declares none. (R-19.5-r via §18.3)

## Parameters

### prompt

#### arguments?

readonly `Pick`\<`objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>, `"name"`\>[]

## Returns

`string`[]
