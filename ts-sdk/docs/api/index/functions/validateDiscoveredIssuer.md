[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateDiscoveredIssuer

# Function: validateDiscoveredIssuer()

> **validateDiscoveredIssuer**(`documentIssuer`, `expectedIssuer`): [`DiscoveredIssuerValidation`](../type-aliases/DiscoveredIssuerValidation.md)

Defined in: [protocol/authorization-registration.ts:715](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L715)

Validates that a fetched authorization-server metadata document's `issuer` is
IDENTICAL to the issuer used to construct the well-known URL; if it differs the
document MUST NOT be used. (R-23.17-h, R-23.17-i)

Exact string comparison — the same mix-up defence S35's
`validateAuthorizationServerMetadata` performs; this surfaces just the
issuer-identity check under the §23.17 atoms for callers that have already
structurally validated the document.

## Parameters

### documentIssuer

`string`

The `issuer` in the fetched document.

### expectedIssuer

`string`

The issuer used to construct the well-known URL.

## Returns

[`DiscoveredIssuerValidation`](../type-aliases/DiscoveredIssuerValidation.md)
