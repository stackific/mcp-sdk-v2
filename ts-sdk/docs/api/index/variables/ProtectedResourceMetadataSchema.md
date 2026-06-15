[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ProtectedResourceMetadataSchema

# Variable: ProtectedResourceMetadataSchema

> `const` **ProtectedResourceMetadataSchema**: `ZodObject`\<\{ `resource`: `ZodString`; `authorization_servers`: `ZodArray`\<`ZodString`, `"many"`\>; `scopes_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `bearer_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `resource`: `ZodString`; `authorization_servers`: `ZodArray`\<`ZodString`, `"many"`\>; `scopes_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `bearer_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `resource`: `ZodString`; `authorization_servers`: `ZodArray`\<`ZodString`, `"many"`\>; `scopes_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `bearer_methods_supported`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/authorization.ts:577](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L577)

The OAuth 2.0 Protected Resource Metadata document the MCP server publishes.
(§23.2, R-23.2-h, R-23.2-i)

`resource` is REQUIRED and MUST equal the server's canonical resource
identifier (R-23.2-h). `authorization_servers` is REQUIRED for MCP, MUST be
present, and MUST contain at least one entry (R-23.2-i); `.min(1)` enforces
non-emptiness. `scopes_supported` and `bearer_methods_supported` are OPTIONAL.
`.passthrough()` preserves any additional RFC 9728 fields.
