[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IssuerBoundCredentials

# Interface: IssuerBoundCredentials

Defined in: [protocol/authorization-registration.ts:470](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L470)

Persisted client credentials bound to the issuing authorization server. (R-23.16-a)

## Properties

### issuer

> **issuer**: `string`

Defined in: [protocol/authorization-registration.ts:472](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L472)

The issuing authorization server's `issuer` identifier; the storage key. (R-23.16-b)

***

### clientId

> **clientId**: `string`

Defined in: [protocol/authorization-registration.ts:474](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L474)

The `client_id` issued by (or pre-registered with) that authorization server.

***

### clientSecret?

> `optional` **clientSecret?**: `string`

Defined in: [protocol/authorization-registration.ts:476](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L476)

OPTIONAL `client_secret` for confidential clients.

***

### cimd?

> `optional` **cimd?**: `boolean`

Defined in: [protocol/authorization-registration.ts:482](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L482)

`true` when these credentials are a Client ID Metadata Document: a portable,
self-hosted HTTPS-URL `client_id` with no per-issuer registration state, hence
exempt from issuer re-binding/re-registration. (R-23.16, CIMD exemption)
