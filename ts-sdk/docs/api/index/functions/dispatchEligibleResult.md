[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / dispatchEligibleResult

# Function: dispatchEligibleResult()

> **dispatchEligibleResult**(`result`): [`EligibleResultDisposition`](../type-aliases/EligibleResultDisposition.md)

Defined in: [protocol/tasks.ts:426](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tasks.ts#L426)

Dispatches a result received for an eligible request on its `resultType`.
(R-25.2-e, R-25.3-c, AC-39.5)

A client that declared the Tasks capability MUST be prepared for EITHER the
request's ordinary result OR a task handle in its place; this helper realizes
that obligation. When `resultType` is `"task"` and the payload is a well-formed
`CreateTaskResult`, the client treats it as a task handle; otherwise the result
is the request's ordinary result and is returned verbatim for the caller's own
`resultType` interpretation (§3 / S04).

Note: a payload whose `resultType` is `"task"` but which is NOT a well-formed
`CreateTaskResult` is returned as `ordinary` here; structural validation /
error handling of a malformed task handle is the caller's concern (it can
re-check with [isCreateTaskResult](isCreateTaskResult.md)).

## Parameters

### result

`unknown`

The raw result object received from the wire.

## Returns

[`EligibleResultDisposition`](../type-aliases/EligibleResultDisposition.md)
