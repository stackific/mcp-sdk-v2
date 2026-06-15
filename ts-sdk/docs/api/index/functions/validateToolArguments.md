[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateToolArguments

# Function: validateToolArguments()

> **validateToolArguments**(`tool`, `args`): [`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)

Defined in: [protocol/tools.ts:491](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L491)

Validates a `tools/call` `arguments` object against the tool's `inputSchema`.
(R-16.4-o)

A receiver MUST validate arguments against the input schema — e.g. an object
`{ location: 42 }` is rejected when the schema requires a string `location`.
The JSON-RPC `tools/call` envelope itself is owned by S25; this is the
validation step S25 calls.

## Parameters

### tool

`ToolSchemas`

### args

`unknown`

## Returns

[`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)
