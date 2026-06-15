[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RequestedSchemaSchema

# Variable: RequestedSchemaSchema

> `const` **RequestedSchemaSchema**: `ZodObject`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `$schema`: `ZodOptional`\<`ZodString`\>; `type`: `ZodLiteral`\<`"object"`\>; `properties`: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `required`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/elicitation.ts:126](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation.ts#L126)

The `requestedSchema` of a form-mode elicitation: a restricted JSON Schema
describing the flat set of fields to collect. (§20.3, R-20.3-e – R-20.3-h)

Field rules:
  - `type` REQUIRED, MUST be the literal `"object"`. (R-20.3-e)
  - `properties` REQUIRED: a flat (non-nested) map from field name to a
    `PrimitiveSchemaDefinition` (the primitive value type itself is owned by
    S31 / §20.4; here each value is accepted as a JSON object and the flatness
    restriction is enforced structurally by [validateRequestedSchema](../functions/validateRequestedSchema.md)).
    (R-20.3-f)
  - `required` OPTIONAL `string[]`: names of properties that MUST be supplied.
    (R-20.3-g)
  - `$schema` OPTIONAL string: the JSON Schema dialect identifier. (R-20.3-h)

`.passthrough()` preserves additional JSON Schema keywords on the object.
