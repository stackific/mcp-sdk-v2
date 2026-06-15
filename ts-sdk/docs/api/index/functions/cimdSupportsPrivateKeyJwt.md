[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / cimdSupportsPrivateKeyJwt

# Function: cimdSupportsPrivateKeyJwt()

> **cimdSupportsPrivateKeyJwt**(`document`): `boolean`

Defined in: [protocol/authorization-registration.ts:250](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L250)

Returns `true` when a CIMD client MAY authenticate to the token endpoint with
`private_key_jwt`: the document declares that method and conveys an appropriate
`jwks`/`jwks_uri`. (R-23.12-f)

## Parameters

### document

`Pick`\<`objectOutputType`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\>, `"token_endpoint_auth_method"`\> & `Record`\<`string`, `unknown`\>

The client's CIMD document.

## Returns

`boolean`
