[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SecurityRequirement

# Interface: SecurityRequirement

Defined in: [protocol/security.ts:96](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L96)

A single normative §28 requirement, as consolidated by S44.

## Properties

### id

> **id**: `string`

Defined in: [protocol/security.ts:98](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L98)

The requirement-atom id, e.g. `'R-28.3-g'`.

***

### level

> **level**: [`SecurityRequirementLevel`](../type-aliases/SecurityRequirementLevel.md)

Defined in: [protocol/security.ts:100](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L100)

Its normative strength.

***

### section

> **section**: `string`

Defined in: [protocol/security.ts:102](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L102)

The §28 subsection that states it, e.g. `'§28.3'`.

***

### principle

> **principle**: `"user-consent-and-control"` \| `"data-privacy"` \| `"tool-safety"` \| `"host-mediated-trust"`

Defined in: [protocol/security.ts:104](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L104)

The core principle it derives from. (§28.1)

***

### statement

> **statement**: `string`

Defined in: [protocol/security.ts:106](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L106)

A concise restatement of the obligation.
