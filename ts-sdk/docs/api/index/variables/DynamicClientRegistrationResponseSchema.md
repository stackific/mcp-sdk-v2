[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationResponseSchema

# Variable: DynamicClientRegistrationResponseSchema

> `const` **DynamicClientRegistrationResponseSchema**: `ZodObject`\<\{ `client_id`: `ZodString`; `client_secret`: `ZodOptional`\<`ZodString`\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `client_id`: `ZodString`; `client_secret`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `client_id`: `ZodString`; `client_secret`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/authorization-flow.ts:490](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L490)

A Dynamic Client Registration response body (Deprecated). (§23.4)

`client_id` is REQUIRED; `client_secret` is issued only for confidential
clients. `.passthrough()` preserves additional RFC 7591 fields.
