[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CompletionCatalog

# Interface: CompletionCatalog

Defined in: [protocol/completion.ts:705](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L705)

The set of valid argument names a given `ref` may complete, supplied by the
server's catalog so [resolveCompletionTarget](../functions/resolveCompletionTarget.md) can detect an unknown ref
or an argument that is not part of the referenced target. (R-19.5-r)

A `PromptReference` is resolved against the server's offered prompts (looked up
by `name`); a `ResourceTemplateReference` against the offered resource
templates (looked up by `uri`/`uriTemplate`). A target found but carrying an
empty argument-name set is still "known" — only an absent target is unknown.

## Methods

### promptArgumentNames()

> **promptArgumentNames**(`name`): readonly `string`[] \| `undefined`

Defined in: [protocol/completion.ts:707](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L707)

Resolves the declared argument names of a prompt, or `undefined` when unknown.

#### Parameters

##### name

`string`

#### Returns

readonly `string`[] \| `undefined`

***

### resourceTemplateVariableNames()

> **resourceTemplateVariableNames**(`uri`): readonly `string`[] \| `undefined`

Defined in: [protocol/completion.ts:709](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L709)

Resolves the declared variable names of a resource template, or `undefined` when unknown.

#### Parameters

##### uri

`string`

#### Returns

readonly `string`[] \| `undefined`
