[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RegistrationMechanismContext

# Interface: RegistrationMechanismContext

Defined in: [protocol/authorization-registration.ts:99](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L99)

The inputs a client inspects to pick a `client_id` mechanism: the validated
authorization-server metadata and whether it already holds pre-registered
credentials for that authorization server. (§23.11, R-23.11-c)

## Properties

### authorizationServerMetadata

> **authorizationServerMetadata**: `Pick`\<[`AuthorizationServerMetadata`](../type-aliases/AuthorizationServerMetadata.md), `"client_id_metadata_document_supported"` \| `"registration_endpoint"`\>

Defined in: [protocol/authorization-registration.ts:105](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L105)

The VALIDATED authorization-server metadata for the discovered AS. A client
MUST inspect this before choosing a mechanism (R-23.11-c). The `cimd` flag and
`registration_endpoint` here gate CIMD and DCR respectively.

***

### hasPreRegisteredCredentials?

> `optional` **hasPreRegisteredCredentials?**: `boolean`

Defined in: [protocol/authorization-registration.ts:113](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L113)

`true` when the client already holds pre-registered client information for the
discovered authorization server (the highest-priority mechanism). (R-23.11-b)

***

### supportedMechanisms?

> `optional` **supportedMechanisms?**: `Iterable`\<[`ClientIdMechanism`](../type-aliases/ClientIdMechanism.md), `any`, `any`\>

Defined in: [protocol/authorization-registration.ts:120](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L120)

The mechanisms this client is capable of, used to skip a mechanism the client
cannot perform even when the AS would allow it. Defaults to all of
pre-registration, CIMD, and DCR (the user prompt is always available as the
final fallback). (R-23.11-b)
