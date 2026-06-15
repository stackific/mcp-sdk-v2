[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateValueAgainstSchema

# Function: validateValueAgainstSchema()

> **validateValueAgainstSchema**(`schema`, `value`): [`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)

Defined in: [protocol/tools.ts:456](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/tools.ts#L456)

Validates a JSON *value* against a JSON Schema *document* (the 2020-12 dialect).
This is the value-validation capability §16.4 places in this story: it is the
machinery a `tools/call` handler uses to validate an `arguments` object against
a tool's `inputSchema`, and a `structuredContent` value against an
`outputSchema`. (§16.4, R-16.4-o, R-16.4-p)

Returns `{ valid: false }` (never throws) when the schema is not a supported
2020-12 object schema or cannot be compiled (e.g. an unresolvable external
`$ref`), mirroring `validateToolSchema`'s refusal to treat such schemas as
permissive.

## Parameters

### schema

`unknown`

The JSON Schema document (e.g. a tool `inputSchema`/`outputSchema`).

### value

`unknown`

The JSON value to validate against it.

## Returns

[`SchemaValueValidation`](../interfaces/SchemaValueValidation.md)
