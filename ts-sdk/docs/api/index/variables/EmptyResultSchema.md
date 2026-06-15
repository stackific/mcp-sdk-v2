[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / EmptyResultSchema

# Variable: EmptyResultSchema

> `const` **EmptyResultSchema**: `ZodObject`\<\{ `resultType`: `ZodString`; `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `resultType`: `string`; `_meta?`: `Record`\<`string`, `unknown`\>; \}, \{ `resultType`: `string`; `_meta?`: `Record`\<`string`, `unknown`\>; \}\>

Defined in: [jsonrpc/payload.ts:125](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L125)

A `Result` returned by a method that succeeds with no method-specific data.
(§3.9, R-3.9-a, R-3.9-b)

Senders MUST still set `resultType` (normally `"complete"`) and MUST NOT
include any members beyond `_meta` and `resultType`.

`EmptyResult` is structurally identical to `Result`; the distinction is
semantic: no method-defined extra members are expected or emitted.
