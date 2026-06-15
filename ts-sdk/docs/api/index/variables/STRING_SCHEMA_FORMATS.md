[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / STRING\_SCHEMA\_FORMATS

# Variable: STRING\_SCHEMA\_FORMATS

> `const` **STRING\_SCHEMA\_FORMATS**: readonly \[`"email"`, `"uri"`, `"date"`, `"date-time"`\]

Defined in: [protocol/elicitation-form.ts:49](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L49)

The four permitted `StringSchema.format` literals. A `format`, when present,
MUST be exactly one of these; any other value (e.g. `"phone"`) is rejected.
(§20.4, R-20.4-d)
