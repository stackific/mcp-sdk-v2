[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateAuthorizationServerMetadata

# Function: validateAuthorizationServerMetadata()

> **validateAuthorizationServerMetadata**(`value`, `expectedIssuer`): [`AuthorizationServerMetadataValidation`](../type-aliases/AuthorizationServerMetadataValidation.md)

Defined in: [protocol/authorization.ts:814](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L814)

Validates a fetched authorization-server metadata document, including the
mandatory issuer-match check. (§23.3, R-23.3-d, R-23.3-e, R-23.3-f – R-23.3-j)

After confirming the document is structurally valid (REQUIRED fields present;
`response_types_supported`/`code_challenge_methods_supported` constraints), it
verifies that the document's `issuer` is identical to the issuer identifier
used to construct the discovery URL (R-23.3-d). If they differ, the document
MUST NOT be used (R-23.3-e) and this returns an error. The comparison is exact
string identity, as the spec's attacker example requires.

## Parameters

### value

`unknown`

The raw fetched document.

### expectedIssuer

`string`

The issuer identifier used to construct the
  discovery URL (R-23.3-d).

## Returns

[`AuthorizationServerMetadataValidation`](../type-aliases/AuthorizationServerMetadataValidation.md)
