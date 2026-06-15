[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isClientIdMetadataDocument

# Function: isClientIdMetadataDocument()

> **isClientIdMetadataDocument**(`value`): `value is objectOutputType<{ client_id: ZodString; client_name: ZodString; redirect_uris: ZodArray<ZodString, "many">; client_uri: ZodOptional<ZodString>; logo_uri: ZodOptional<ZodString>; grant_types: ZodOptional<ZodArray<ZodString, "many">>; response_types: ZodOptional<ZodArray<ZodString, "many">>; token_endpoint_auth_method: ZodOptional<ZodString> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/authorization-flow.ts:309](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L309)

Returns `true` when `value` is a structurally valid CIMD document. (R-23.4-f)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ client_id: ZodString; client_name: ZodString; redirect_uris: ZodArray<ZodString, "many">; client_uri: ZodOptional<ZodString>; logo_uri: ZodOptional<ZodString>; grant_types: ZodOptional<ZodArray<ZodString, "many">>; response_types: ZodOptional<ZodArray<ZodString, "many">>; token_endpoint_auth_method: ZodOptional<ZodString> }, ZodTypeAny, "passthrough">`
