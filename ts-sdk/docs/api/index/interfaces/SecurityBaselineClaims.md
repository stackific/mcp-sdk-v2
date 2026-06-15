[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / SecurityBaselineClaims

# Interface: SecurityBaselineClaims

Defined in: [protocol/security.ts:267](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L267)

A host's self-assertion that it addresses each of the four §28.1 core
principles, the checklist a conformance review asserts against. (§28.1,
R-28-a, R-28.1-a; AC-44.1) Each boolean reports whether the implementation
claims to be designed around that principle.

## Properties

### userConsentAndControl

> **userConsentAndControl**: `boolean`

Defined in: [protocol/security.ts:269](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L269)

Users explicitly consent to and control all data access/operations. (R-28.1-b, R-28.1-c)

***

### dataPrivacy

> **dataPrivacy**: `boolean`

Defined in: [protocol/security.ts:271](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L271)

A server receives only host-elected context; no transmission without consent. (R-28.1-e, R-28.1-f)

***

### toolSafety

> **toolSafety**: `boolean`

Defined in: [protocol/security.ts:273](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L273)

Tools are treated as arbitrary code; definitions/annotations are untrusted. (R-28.1-h, R-28.1-i)

***

### hostMediatedTrust

> **hostMediatedTrust**: `boolean`

Defined in: [protocol/security.ts:275](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L275)

Trust is mediated and enforced at the host, never delegated to a server. (§28.1(4))
