[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / checkPreRegisteredCredentials

# Function: checkPreRegisteredCredentials()

> **checkPreRegisteredCredentials**(`credentialIssuer`, `metadataIssuer`): [`PreRegistrationCheck`](../type-aliases/PreRegistrationCheck.md)

Defined in: [protocol/authorization-flow.ts:261](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L261)

Verifies that pre-registered credentials' authorization server matches the one
indicated by protected-resource metadata, surfacing an error on mismatch rather
than silently using mismatched credentials. (R-23.4-c)

Compares the two `issuer` values by exact string match. On mismatch the caller
SHOULD surface the returned reason and MUST NOT use the credentials.

## Parameters

### credentialIssuer

`string`

The `issuer` the pre-registered credentials belong to.

### metadataIssuer

`string`

The `issuer` selected from protected-resource metadata.

## Returns

[`PreRegistrationCheck`](../type-aliases/PreRegistrationCheck.md)
