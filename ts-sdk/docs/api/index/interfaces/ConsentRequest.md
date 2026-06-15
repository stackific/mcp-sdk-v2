[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ConsentRequest

# Interface: ConsentRequest

Defined in: [protocol/security.ts:327](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L327)

A proposed operation seeking the host's consent gate. (§28.2)

## Properties

### operation

> **operation**: `string`

Defined in: [protocol/security.ts:329](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L329)

The operation being proposed.

***

### scope

> **scope**: `string`

Defined in: [protocol/security.ts:331](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L331)

The scope summary of the proposed operation, compared against any prior grant.

***

### userApproved?

> `optional` **userApproved?**: `boolean`

Defined in: [protocol/security.ts:338](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L338)

Whether the user has, for THIS proposal, actively and informedly granted
consent. Silence/absence MUST NOT be passed as `true` (R-28.2-d). When the
proposal matches a prior grant of the same operation+scope, a fresh active
grant is not required.
