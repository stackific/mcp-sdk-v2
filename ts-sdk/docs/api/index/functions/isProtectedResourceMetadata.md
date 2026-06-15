[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isProtectedResourceMetadata

# Function: isProtectedResourceMetadata()

> **isProtectedResourceMetadata**(`value`): `value is objectOutputType<{ resource: ZodString; authorization_servers: ZodArray<ZodString, "many">; scopes_supported: ZodOptional<ZodArray<ZodString, "many">>; bearer_methods_supported: ZodOptional<ZodArray<ZodString, "many">> }, ZodTypeAny, "passthrough">`

Defined in: [protocol/authorization.ts:593](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L593)

Returns `true` when `value` is a structurally valid `ProtectedResourceMetadata`. (R-23.2-h, R-23.2-i)

## Parameters

### value

`unknown`

## Returns

`value is objectOutputType<{ resource: ZodString; authorization_servers: ZodArray<ZodString, "many">; scopes_supported: ZodOptional<ZodArray<ZodString, "many">>; bearer_methods_supported: ZodOptional<ZodArray<ZodString, "many">> }, ZodTypeAny, "passthrough">`
