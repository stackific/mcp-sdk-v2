[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveCompletionTarget

# Function: resolveCompletionTarget()

> **resolveCompletionTarget**(`params`, `catalog`): [`CompletionTargetResolution`](../type-aliases/CompletionTargetResolution.md)

Defined in: [protocol/completion.ts:733](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L733)

Resolves a validated `ref` + `argument.name` against the server's catalog,
enforcing R-19.5-r: an unknown prompt / unknown resource template, or an
`argument.name` that is not a valid argument of the referenced target, MUST be
rejected with `-32602` (Invalid params) — NOT a not-found result. (R-19.5-r,
AC-29.24)

The `ref` is selected by `ref.type` (R-19.2-d): a `PromptReference` resolves
against [CompletionCatalog.promptArgumentNames](../interfaces/CompletionCatalog.md#promptargumentnames), a
`ResourceTemplateReference` against
[CompletionCatalog.resourceTemplateVariableNames](../interfaces/CompletionCatalog.md#resourcetemplatevariablenames).

## Parameters

### params

`objectOutputType`

A `completion/complete` params object already validated for
  shape by [validateCompleteRequest](validateCompleteRequest.md).

### catalog

[`CompletionCatalog`](../interfaces/CompletionCatalog.md)

The server's prompt / resource-template catalog.

## Returns

[`CompletionTargetResolution`](../type-aliases/CompletionTargetResolution.md)
