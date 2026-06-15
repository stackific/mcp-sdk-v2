[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / sanitizeToolOutputText

# Function: sanitizeToolOutputText()

> **sanitizeToolOutputText**(`text`): `string`

Defined in: [protocol/security.ts:637](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L637)

Sanitizes a tool-output text string so a result cannot carry control sequences
that would compromise the client, model, or downstream consumers. (§28.3,
R-28.3-i; AC-44.9)

Strips C0/C1 control characters (excluding the ordinary whitespace `\t`, `\n`,
`\r`) — the ANSI/escape and other control sequences a malicious tool could
smuggle into a result. It is a content-level guard: structural sanitization of
markup/injected instructions remains the host's responsibility per its render
target, but stripping control sequences here removes the lowest-level vector.

## Parameters

### text

`string`

The tool-output text to sanitize.

## Returns

`string`
