[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateToolStructuredContent

# Function: validateToolStructuredContent()

> **validateToolStructuredContent**(`tool`, `structuredContent`): [`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)

Defined in: [protocol/tools.ts:502](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L502)

Validates a tool result's `structuredContent` against the tool's `outputSchema`.
(R-16.4-p)

When the tool declares no `outputSchema` there is nothing to validate and the
result is `{ valid: true }`. Otherwise the value MUST conform to the schema.

## Parameters

### tool

`ToolSchemas`

### structuredContent

`unknown`

## Returns

[`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)
