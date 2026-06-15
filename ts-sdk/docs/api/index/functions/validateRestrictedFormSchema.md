[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateRestrictedFormSchema

# Function: validateRestrictedFormSchema()

> **validateRestrictedFormSchema**(`value`): [`RestrictedFormSchemaValidation`](../type-aliases/RestrictedFormSchemaValidation.md)

Defined in: [protocol/elicitation-form.ts:493](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L493)

Validates a form-mode `requestedSchema` against the FULL restricted form schema:
the outer object shape (`type: "object"`, a `properties` map, optional
`required`/`$schema`) PLUS the §20.4 requirement that every property is a valid
[PrimitiveSchemaDefinition](../type-aliases/PrimitiveSchemaDefinition.md). (§20.4, R-20.4-a)

This is the §20.4 deepening of S30's §20.3 structural check, and it owns the
full flatness judgement here: the primitive union itself excludes nesting — a
nested object (`type: "object"`), a generic array-of-objects, a `$ref`, or a
composition keyword on a property fails to match any of the four members and is
rejected. Crucially, it ACCEPTS the enum array forms (`oneOf`/`anyOf`/`items`),
which are the deliberate exceptions §20.4 carves out — these are matched as
[EnumSchema](../type-aliases/EnumSchema.md) members rather than treated as forbidden nesting. (R-20.4-a)

Every `required` entry must name a declared property.

## Parameters

### value

`unknown`

The candidate `requestedSchema` object.

## Returns

[`RestrictedFormSchemaValidation`](../type-aliases/RestrictedFormSchemaValidation.md)
