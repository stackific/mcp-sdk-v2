[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / classifyToolDefinitionTrust

# Function: classifyToolDefinitionTrust()

> **classifyToolDefinitionTrust**(`serverIsTrusted`): [`InputTrust`](../type-aliases/InputTrust.md)

Defined in: [protocol/security.ts:457](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L457)

Classifies a tool definition's trust. A tool definition — names, descriptions,
input/output schemas, and annotations — is `untrusted` unless obtained from a
server the host trusts. (§28.3, R-28.1-i, R-28.3-b; AC-44.6)

Use the result to gate any reliance on the definition's contents: an `untrusted`
definition's descriptions may be adversarial (prompt injection) and its
annotations carry no authority ([toolAnnotationIsSecurityGuarantee](toolAnnotationIsSecurityGuarantee.md)).

## Parameters

### serverIsTrusted

`boolean`

Whether the host explicitly trusts the originating server.

## Returns

[`InputTrust`](../type-aliases/InputTrust.md)
