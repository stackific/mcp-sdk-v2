[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateToolXMcpHeaders

# Function: validateToolXMcpHeaders()

> **validateToolXMcpHeaders**(`tool`): [`ToolValidationResult`](../type-aliases/ToolValidationResult.md)

Defined in: [transport/http/param-headers.ts:143](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/param-headers.ts#L143)

Validates every `x-mcp-header` annotation in a tool's `inputSchema`. (§9.5.1)

Checks each annotation's name (R-9.5.1-a/b/c), that the annotated parameter's
type is a primitive `integer`/`string`/`boolean` (R-9.5.1-e) and not `number`
(R-9.5.1-f), and that all names are case-insensitively unique within the
schema (R-9.5.1-d). Annotations at any nesting depth are accepted (R-9.5.1-h).

## Parameters

### tool

[`ToolDefinition`](../interfaces/ToolDefinition.md)

## Returns

[`ToolValidationResult`](../type-aliases/ToolValidationResult.md)
