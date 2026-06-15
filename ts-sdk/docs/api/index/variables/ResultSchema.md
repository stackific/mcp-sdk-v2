[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ResultSchema

# Variable: ResultSchema

> `const` **ResultSchema**: `ZodObject`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `resultType`: `ZodString`; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `resultType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `_meta`: `ZodOptional`\<`ZodRecord`\<`ZodString`, `ZodUnknown`\>\>; `resultType`: `ZodString`; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/payload.ts:102](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L102)

The object that occupies the `result` member of every success response.
All method-specific results extend this base type. (§3.6)

Fields:
  `_meta` (OPTIONAL): metadata map; keys follow the §4 / S05 naming rules.
  Receivers MUST NOT act on MCP-reserved `_meta` keys they do not understand.
  (R-3.6-a, R-3.6-b)

  `resultType` (REQUIRED): discriminator; every server MUST set it.
  (R-3.6-c, R-3.6-h)

  Additional members: defined by the specific method; MAY be present.
  (R-3.6-d) `.passthrough()` preserves them through parse.
