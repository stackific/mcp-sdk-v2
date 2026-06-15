[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / parseRoot

# Function: parseRoot()

> **parseRoot**(`value`): `SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/roots.ts:365](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L365)

Validates a single `Root`, enforcing the §21.1 `uri` constraints. (§21.1.5;
AC-32.11, AC-32.13)

A missing, non-`file`, or malformed `uri` fails; a present string `name` and
unrecognized `_meta` members are accepted. (R-21.1.5-b, -d, -e, -f)

## Parameters

### value

`unknown`

## Returns

`SafeParseReturnType`\<`unknown`, `objectOutputType`\<\{ `uri`: `ZodEffects`\<`ZodString`, `string`, `string`\>; `name`: `ZodOptional`\<`ZodString`\>; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>
