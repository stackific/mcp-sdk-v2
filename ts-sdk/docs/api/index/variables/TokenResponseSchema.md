[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TokenResponseSchema

# Variable: TokenResponseSchema

> `const` **TokenResponseSchema**: `ZodObject`\<\{ `access_token`: `ZodString`; `token_type`: `ZodString`; `expires_in`: `ZodOptional`\<`ZodNumber`\>; `refresh_token`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `access_token`: `ZodString`; `token_type`: `ZodString`; `expires_in`: `ZodOptional`\<`ZodNumber`\>; `refresh_token`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `access_token`: `ZodString`; `token_type`: `ZodString`; `expires_in`: `ZodOptional`\<`ZodNumber`\>; `refresh_token`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/authorization-flow.ts:1349](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L1349)

The token-endpoint JSON response. (§23.5 Step 4, §23.9)

`access_token` and `token_type` (`Bearer`) are REQUIRED; `expires_in`,
`refresh_token`, and `scope` are OPTIONAL — a client MUST NOT assume a refresh
token will be issued (R-23.9-d). `.passthrough()` preserves additional RFC 6749
fields.
