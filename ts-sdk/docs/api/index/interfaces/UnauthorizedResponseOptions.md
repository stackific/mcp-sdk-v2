[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UnauthorizedResponseOptions

# Interface: UnauthorizedResponseOptions

Defined in: [protocol/authorization.ts:414](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L414)

Inputs to [buildUnauthorizedResponse](../functions/buildUnauthorizedResponse.md).

## Properties

### resourceMetadata

> **resourceMetadata**: `string`

Defined in: [protocol/authorization.ts:416](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L416)

REQUIRED absolute URI of the protected-resource metadata document. (R-23.1-v)

***

### scope?

> `optional` **scope?**: `string`

Defined in: [protocol/authorization.ts:418](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L418)

SHOULD-present scopes required to access the resource. (R-23.1-w)
