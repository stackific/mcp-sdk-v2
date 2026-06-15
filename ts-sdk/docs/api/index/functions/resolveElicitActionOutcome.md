[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveElicitActionOutcome

# Function: resolveElicitActionOutcome()

> **resolveElicitActionOutcome**(`result`, `mode`, `requestedSchema?`): [`ElicitActionOutcome`](../type-aliases/ElicitActionOutcome.md)

Defined in: [protocol/elicitation-form.ts:949](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L949)

Maps a returned `ElicitResult` to the server's handling directive, encoding the
§20.5 rule that a server MUST NOT assume success and MUST handle decline,
cancel, and a client failure to process. (§20.5, R-20.5-d – R-20.5-h)

The returned `handle` gives the server an explicit branch for every action:
`process-form-data` (form accept), `await-url-completion` (url accept — consent
not completion), `declined`, `cancelled`, and `malformed` (the client's answer
did not conform — treated as a failure to process, never as success).

## Parameters

### result

`unknown`

The `ElicitResult` returned by the client.

### mode

[`ElicitationMode`](../type-aliases/ElicitationMode.md)

The mode of the originating request.

### requestedSchema?

`unknown`

The form-mode `requestedSchema` (for content checks).

## Returns

[`ElicitActionOutcome`](../type-aliases/ElicitActionOutcome.md)
