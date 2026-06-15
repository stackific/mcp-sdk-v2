[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ClientIdMetadataDocumentSchema

# Variable: ClientIdMetadataDocumentSchema

> `const` **ClientIdMetadataDocumentSchema**: `ZodObject`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/authorization-flow.ts:285](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L285)

A Client ID Metadata Document (CIMD): a JSON document hosted at an HTTPS URL
that *is* the client's `client_id`. (§23.4, R-23.4-f, R-23.4-g)

`client_id`, `client_name`, and `redirect_uris` are REQUIRED (R-23.4-f);
`client_id` MUST exactly equal the document's own URL (R-23.4-g, enforced at
validation time by [validateClientIdMetadataDocument](../functions/validateClientIdMetadataDocument.md)). `.passthrough()`
preserves any additional client-metadata fields.
