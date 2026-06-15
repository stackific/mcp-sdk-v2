[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ElicitContentValueSchema

# Variable: ElicitContentValueSchema

> `const` **ElicitContentValueSchema**: `ZodUnion`\<\[`ZodString`, `ZodNumber`, `ZodBoolean`, `ZodArray`\<`ZodString`, `"many"`\>\]\>

Defined in: [protocol/elicitation-form.ts:600](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L600)

Schema for a single `content` value: a string, number, boolean, or array of
strings — the only value types a form-mode `content` map may carry.
(§20.5, R-20.5-c)
