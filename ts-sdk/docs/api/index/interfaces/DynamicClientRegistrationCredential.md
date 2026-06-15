[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationCredential

# Interface: DynamicClientRegistrationCredential

Defined in: [protocol/authorization-flow.ts:552](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L552)

Persisted DCR credentials, bound to the issuing authorization server's `issuer`.
(R-23.4-s)

## Properties

### issuer

> **issuer**: `string`

Defined in: [protocol/authorization-flow.ts:554](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L554)

The issuing authorization server's `issuer`; the binding key. (R-23.4-s)

***

### clientId

> **clientId**: `string`

Defined in: [protocol/authorization-flow.ts:556](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L556)

The issued `client_id`.

***

### clientSecret?

> `optional` **clientSecret?**: `string`

Defined in: [protocol/authorization-flow.ts:558](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L558)

OPTIONAL issued secret for confidential clients.
