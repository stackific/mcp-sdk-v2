[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildCompleteRequestParams

# Function: buildCompleteRequestParams()

> **buildCompleteRequestParams**(`opts`): `objectOutputType`

Defined in: [protocol/completion.ts:342](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L342)

Builds a `completion/complete` request `params` object. `context` and `_meta`
are included only when supplied — they are never defaulted. (§19.2)

A client SHOULD populate `context.arguments` with already-resolved sibling
argument values (excluding `argument.name`) to obtain context-sensitive
suggestions across a multi-argument prompt or template (R-19.2-j, R-19.5-m); a
supplied `context.arguments` is rejected here when it contains `argument.name`
(R-19.2-k).

## Parameters

### opts

#### ref

`objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/prompt"`\>; `name`: `ZodString`; `title`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `objectOutputType`\<\{ `type`: `ZodLiteral`\<`"ref/resource"`\>; `uri`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>

#### argument

`objectOutputType`

#### context?

`objectOutputType`\<\{ `arguments`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodString`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>

#### _meta?

`Record`\<`string`, `unknown`\>

## Returns

`objectOutputType`

## Throws

When `context.arguments` includes a key equal to
  `argument.name` — that key MUST be excluded (R-19.2-k).
