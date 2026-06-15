[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateGetPromptRequest

# Function: validateGetPromptRequest()

> **validateGetPromptRequest**(`params`, `offered`): [`GetPromptRequestValidation`](../type-aliases/GetPromptRequestValidation.md)

Defined in: [protocol/prompts.ts:632](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/prompts.ts#L632)

Validates a `prompts/get` request against the server's offered prompts: it MUST
name a prompt the server offers, and MUST supply every argument that prompt
declares `required: true`. (R-18.4-c – R-18.4-g, AC-28.29, AC-28.30)

On failure returns the mapped `-32602` error (unknown name OR missing required
argument); a server SHOULD validate arguments before processing (R-18.4-f). The
unknown-name check runs first, then the required-argument check.

## Parameters

### params

The `prompts/get` request params (`name` + optional `arguments`).

#### name

`string`

#### arguments?

`Record`\<`string`, `string`\>

### offered

readonly `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>[] \| `ReadonlyMap`\<`string`, `objectOutputType`\<`object` & `object`, `ZodTypeAny`, `"passthrough"`\>\>

The prompts the server offers, used to look up the named prompt
  and its declared arguments (an array of `Prompt`, or a `name → Prompt` map).

## Returns

[`GetPromptRequestValidation`](../type-aliases/GetPromptRequestValidation.md)
