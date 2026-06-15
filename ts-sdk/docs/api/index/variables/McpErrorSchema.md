[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / McpErrorSchema

# Variable: McpErrorSchema

> `const` **McpErrorSchema**: `ZodObject`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `code`: `ZodNumber`; `message`: `ZodString`; `data`: `ZodOptional`\<`ZodUnknown`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [jsonrpc/payload.ts:220](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/payload.ts#L220)

The object carried in the `error` member of every error response. (§3.8)

Named `McpError` to avoid shadowing the built-in `Error` class.

Fields:
  `code` (REQUIRED integer): identifies the error condition. Legal values and
  their use conditions are defined in §22 / S34. Implementations MUST NOT
  assign codes outside those rules. (R-3.8-a, R-3.8-b)

  `message` (REQUIRED string): short, human-readable description. SHOULD be
  a single concise sentence. (R-3.8-c, R-3.8-d)

  `data` (OPTIONAL any): sender-defined additional info. Receivers MUST NOT
  assume a particular structure unless the specific code defines one in §22.
  (R-3.8-e, R-3.8-f)
