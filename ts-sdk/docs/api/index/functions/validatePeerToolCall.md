[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validatePeerToolCall

# Function: validatePeerToolCall()

> **validatePeerToolCall**(`options`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `code`: `-32602`; `message`: `string`; `errors`: `string`[]; \}

Defined in: [protocol/security.ts:1316](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L1316)

Validates `tools/call` arguments against a tool's declared input schema and,
optionally, structured results against an output schema, reporting a failure as a
`-32602` error rather than acting on the input. (§28.10, R-28.10-a, R-28.10-b,
R-28.10-c, R-28.10-d, R-28.10-e; AC-44.24)

Delegates to S25's [validateToolArguments](validateToolArguments.md) / [validateToolStructuredContent](validateToolStructuredContent.md);
on failure returns a structured error (matching the story's wire example) so the
caller reports it rather than executing the call — a receiver MUST validate all
peer inputs first and MUST NOT assume a peer is well-behaved.

## Parameters

### options

#### tool

\{ `inputSchema`: `unknown`; `outputSchema?`: `unknown`; \}

The tool's `inputSchema` (and optional `outputSchema`).

#### tool.inputSchema

`unknown`

#### tool.outputSchema?

`unknown`

#### args

`unknown`

The `arguments` object to validate. (R-28.10-c)

#### structuredResult?

`unknown`

OPTIONAL structured result to validate against the
  output schema. (R-28.10-d)

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `code`: `-32602`; `message`: `string`; `errors`: `string`[]; \}
