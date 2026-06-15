[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildOutputSchemaResult

# Function: buildOutputSchemaResult()

> **buildOutputSchemaResult**(`structuredContent`, `extraContent?`): `objectOutputType`

Defined in: [protocol/tools-call.ts:343](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools-call.ts#L343)

Builds a successful `CallToolResult` for a tool that declares an `outputSchema`:
it populates `structuredContent` with the (assumed schema-conforming) value
AND prepends a textual `content` fallback carrying the JSON serialization, per
the SHOULD in §16.5. (R-16.5-o, R-16.5-p)

The caller is responsible for validating `structuredContent` against the
`outputSchema` (via S24's [validateToolStructuredContent](validateToolStructuredContent.md)); this helper
assembles the wire shape.

## Parameters

### structuredContent

`unknown`

The schema-conforming structured result.

### extraContent?

readonly [`ContentBlock`](../type-aliases/ContentBlock.md)[] = `[]`

OPTIONAL additional content blocks appended after the
  serialized-JSON text fallback.

## Returns

`objectOutputType`
