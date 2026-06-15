[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / InsufficientScopeResponseOptions

# Interface: InsufficientScopeResponseOptions

Defined in: [protocol/authorization.ts:446](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L446)

Inputs to [buildInsufficientScopeResponse](../functions/buildInsufficientScopeResponse.md).

## Properties

### scope

> **scope**: `string`

Defined in: [protocol/authorization.ts:452](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L452)

Space-delimited required scopes. SHOULD include ALL scopes required for the
current operation in this single challenge rather than challenging
incrementally. (R-23.1-ab, R-23.1-ac)

***

### resourceMetadata

> **resourceMetadata**: `string`

Defined in: [protocol/authorization.ts:454](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L454)

Absolute URI of the protected-resource metadata document. (R-23.1-ab)

***

### errorDescription?

> `optional` **errorDescription?**: `string`

Defined in: [protocol/authorization.ts:456](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L456)

OPTIONAL human-readable description of the failure. (R-23.1-ad)
