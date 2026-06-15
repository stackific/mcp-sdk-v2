[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationRequestSchema

# Variable: DynamicClientRegistrationRequestSchema

> `const` **DynamicClientRegistrationRequestSchema**: `ZodObject`\<\{ `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `application_type`: `ZodEnum`\<\[`"native"`, `"web"`\]\>; `client_name`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `application_type`: `ZodEnum`\<\[`"native"`, `"web"`\]\>; `client_name`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `application_type`: `ZodEnum`\<\[`"native"`, `"web"`\]\>; `client_name`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; `scope`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/authorization-flow.ts:416](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L416)

A Dynamic Client Registration request body (Deprecated). (§23.4, R-23.4-m)

`redirect_uris` and `application_type` are REQUIRED per MCP (R-23.4-m); omitting
`application_type` would default to `web` under OIDC, which MCP does not permit,
so the schema requires it explicitly. `.passthrough()` preserves additional
RFC 7591 fields.
