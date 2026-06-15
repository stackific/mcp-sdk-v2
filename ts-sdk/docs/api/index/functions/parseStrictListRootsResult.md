[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseStrictListRootsResult

# Function: parseStrictListRootsResult()

> **parseStrictListRootsResult**(`value`): `SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/roots.ts:441](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L441)

Validates a `ListRootsResult` with full §21.1 `Root` enforcement. (§21.1.5;
AC-32.10, AC-32.11)

A result missing `roots` fails; `{ roots: [] }` succeeds ("no roots
exposed"); a result whose every `Root` carries a valid `file://` `uri`
succeeds; any non-`file`/malformed/missing `uri` fails.

## Parameters

### value

`unknown`

## Returns

`SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `roots`: `ZodArray`\<`ZodObject`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>, `"many"`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>
