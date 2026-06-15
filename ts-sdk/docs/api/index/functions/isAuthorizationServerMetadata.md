[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isAuthorizationServerMetadata

# Function: isAuthorizationServerMetadata()

> **isAuthorizationServerMetadata**(`value`): `value is objectOutputType<{ issuer: ZodString; authorization_endpoint: ZodString; token_endpoint: ZodString; registration_endpoint: ZodOptional<ZodString>; scopes_supported: ZodOptional<ZodArray<ZodString, "many">>; response_types_supported: ZodOptional<ZodArray<ZodString, "many">>; grant_types_supported: ZodOptional<ZodArray<ZodString, "many">>; code_challenge_methods_supported: ZodOptional<ZodArray<ZodString, "many">>; token_endpoint_auth_methods_supported: ZodOptional<ZodArray<ZodString, "many">>; authorization_response_iss_parameter_supported: ZodOptional<ZodBoolean>; client_id_metadata_document_supported: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/authorization.ts:790](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L790)

Returns `true` when `value` is a structurally valid `AuthorizationServerMetadata`. (R-23.3-f – R-23.3-j)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ issuer: ZodString; authorization_endpoint: ZodString; token_endpoint: ZodString; registration_endpoint: ZodOptional<ZodString>; scopes_supported: ZodOptional<ZodArray<ZodString, "many">>; response_types_supported: ZodOptional<ZodArray<ZodString, "many">>; grant_types_supported: ZodOptional<ZodArray<ZodString, "many">>; code_challenge_methods_supported: ZodOptional<ZodArray<ZodString, "many">>; token_endpoint_auth_methods_supported: ZodOptional<ZodArray<ZodString, "many">>; authorization_response_iss_parameter_supported: ZodOptional<ZodBoolean>; client_id_metadata_document_supported: ZodOptional<ZodBoolean> }, ZodTypeAny, "passthrough">`
