[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DynamicClientRegistrationStore

# Class: DynamicClientRegistrationStore

Defined in: [protocol/authorization-flow.ts:570](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L570)

A store for persisted DCR credentials, each keyed by the issuing authorization
server's `issuer`, that re-registers when the authorization server changes.
(R-23.4-s, R-23.4-t)

Separate from S35's import('./authorization.js').CredentialStore, which
holds runtime per-issuer access/refresh tokens; this store holds the persisted
registration identity (`client_id`/`client_secret`) the DCR rules govern.

## Constructors

### Constructor

> **new DynamicClientRegistrationStore**(): `DynamicClientRegistrationStore`

#### Returns

`DynamicClientRegistrationStore`

## Methods

### save()

> **save**(`credential`): `void`

Defined in: [protocol/authorization-flow.ts:577](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L577)

Persists `credential`, keyed by its `issuer`. Each authorization server keeps
an isolated entry. (R-23.4-s)

#### Parameters

##### credential

[`DynamicClientRegistrationCredential`](../interfaces/DynamicClientRegistrationCredential.md)

#### Returns

`void`

***

### credentialFor()

> **credentialFor**(`issuer`): [`DynamicClientRegistrationCredential`](../interfaces/DynamicClientRegistrationCredential.md) \| `undefined`

Defined in: [protocol/authorization-flow.ts:582](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L582)

Returns the persisted credential for `issuer`, or `undefined`. (R-23.4-s)

#### Parameters

##### issuer

`string`

#### Returns

[`DynamicClientRegistrationCredential`](../interfaces/DynamicClientRegistrationCredential.md) \| `undefined`

***

### needsRegistration()

> **needsRegistration**(`issuer`): `boolean`

Defined in: [protocol/authorization-flow.ts:595](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L595)

Returns `true` when the client must (re-)register against `issuer` — i.e. no
credential is yet persisted for that authorization server. A client MUST
re-register when the authorization server changes, which manifests as the new
`issuer` having no persisted credential. (R-23.4-t)

#### Parameters

##### issuer

`string`

The `issuer` now indicated by protected-resource metadata.

#### Returns

`boolean`
