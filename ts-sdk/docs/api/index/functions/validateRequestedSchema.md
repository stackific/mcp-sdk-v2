[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRequestedSchema

# Function: validateRequestedSchema()

> **validateRequestedSchema**(`value`): [`RequestedSchemaValidation`](../type-aliases/RequestedSchemaValidation.md)

Defined in: [protocol/elicitation.ts:324](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L324)

Validates the STRUCTURAL restrictions on a form-mode `requestedSchema`:
`type` is the literal `"object"`, `properties` is a flat (non-nested) map, and
every `required` entry names a declared property. (§20.3, §20.4, R-20.3-e,
R-20.3-f, R-20.3-g)

"Flat" means each property's schema describes a primitive — it MUST NOT itself
be an object/array container (no `properties`, `items`, `$ref`, composition
keywords, or `type: "object"`/`"array"`). The full `PrimitiveSchemaDefinition`
value model is owned by S31 (§20.4); this checks only the flatness the story
pins here, so a property schema is otherwise accepted as a JSON object.

## Parameters

### value

`unknown`

The candidate `requestedSchema` object.

## Returns

[`RequestedSchemaValidation`](../type-aliases/RequestedSchemaValidation.md)
