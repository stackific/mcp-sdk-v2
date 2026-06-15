[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / mayDisplayToolAnnotations

# Function: mayDisplayToolAnnotations()

> **mayDisplayToolAnnotations**(`serverIsTrusted`): `boolean`

Defined in: [protocol/security.ts:485](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L485)

Returns whether a host MAY surface a tool's annotation hints to the user for
THIS server — delegating to S25's [mayTrustToolAnnotations](mayTrustToolAnnotations.md). Displaying a
hint from a trusted server is permitted (R-28.3-b); relying on it as a guarantee
is not ([toolAnnotationIsSecurityGuarantee](toolAnnotationIsSecurityGuarantee.md), R-28.3-c). (§28.3; AC-44.6)

## Parameters

### serverIsTrusted

`boolean`

Whether the host explicitly trusts the server.

## Returns

`boolean`
