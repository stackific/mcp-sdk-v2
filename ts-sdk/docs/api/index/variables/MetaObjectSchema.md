[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MetaObjectSchema

# Variable: MetaObjectSchema

> `const` **MetaObjectSchema**: `ZodRecord`\<`ZodString`, `ZodUnknown`\>

Defined in: [protocol/meta.ts:81](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L81)

A string-keyed map for arbitrary metadata attached to a message. (§4.1)

The value of `_meta` is always a JSON object — never an array or scalar.
(R-4.1-j) Each member value MAY be any JSON value. (R-4.1-b)
