[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitContentSchema

# Variable: ElicitContentSchema

> `const` **ElicitContentSchema**: `ZodRecord`\<`ZodString`, `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodString`, `"many"`\>\]\>\>

Defined in: [protocol/elicitation-form.ts:613](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L613)

Schema for the `ElicitResult.content` map: field name → permitted value type.
(§20.5, R-20.5-c)
