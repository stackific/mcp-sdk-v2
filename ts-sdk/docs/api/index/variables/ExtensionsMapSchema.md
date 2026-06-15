[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ExtensionsMapSchema

# Variable: ExtensionsMapSchema

> `const` **ExtensionsMapSchema**: `ZodRecord`\<`ZodString`, `ZodRecord`\<`ZodString`, `ZodUnknown`\>\>

Defined in: [protocol/extensions.ts:175](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L175)

Schema for a producer-built, well-formed `extensions` map: extension
identifier → settings object, with NO `null` values. (§6.5)

This is the schema a PRODUCER validates its own map against (R-6.5-i: no key
maps to `null`). A RECEIVER processing an untrusted map should instead call
[normalizeExtensionsMap](../functions/normalizeExtensionsMap.md), which tolerates and discards malformed
entries per the forward-compatibility rules (R-6.5-j, R-6.6-d).
