[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateCompleteRequest

# Function: validateCompleteRequest()

> **validateCompleteRequest**(`params`): [`CompleteRequestValidation`](../type-aliases/CompleteRequestValidation.md)

Defined in: [protocol/completion.ts:656](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/completion.ts#L656)

Validates a raw `completion/complete` `params` payload against the §19.2/§19.3
shape: `ref` REQUIRED and a member of the closed union, `argument` REQUIRED
with REQUIRED string `name`/`value`, and (when present) `context.arguments`
keys MUST NOT include `argument.name`. (§19.2, §19.3, R-19.2-b – R-19.2-k,
R-19.3-f, R-19.5-s)

Maps every shape failure to the `-32602` (Invalid params) error. A
`ref.type` outside `"ref/prompt"` / `"ref/resource"` is rejected by the closed
union (R-19.2-e, R-19.3-f). This validates the request SHAPE only; the
unknown-prompt / unknown-template / unknown-argument checks (R-19.5-r) require
the server's catalog and are exposed separately via
[resolveCompletionTarget](resolveCompletionTarget.md).

## Parameters

### params

`unknown`

The raw `completion/complete` request params.

## Returns

[`CompleteRequestValidation`](../type-aliases/CompleteRequestValidation.md)
