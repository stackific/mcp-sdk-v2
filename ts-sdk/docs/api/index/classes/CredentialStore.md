[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CredentialStore

# Class: CredentialStore

Defined in: [protocol/authorization.ts:159](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L159)

A per-authorization-server credential store keyed by `issuer`. (R-23.1-i)

Enforces the four isolation rules of §23.1:
  - registration state is kept separate per `issuer` (R-23.1-i);
  - [credentialsFor](#credentialsfor) never returns another server's credentials, so a
    caller cannot assume one server's credentials work at another (R-23.1-j);
  - [needsReregistration](#needsreregistration) reports `true` when the indicated authorization
    server changes, so the client does not reuse the previous server's
    credentials (R-23.1-k) and re-registers/re-discovers against the new one
    (R-23.1-l).

## Constructors

### Constructor

> **new CredentialStore**(): `CredentialStore`

#### Returns

`CredentialStore`

## Methods

### register()

> **register**(`registration`): `void`

Defined in: [protocol/authorization.ts:166](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L166)

Records (or replaces) the registration state for `registration.issuer`.
Each `issuer` keeps an isolated entry. (R-23.1-i)

#### Parameters

##### registration

[`AuthorizationServerRegistration`](../interfaces/AuthorizationServerRegistration.md)

#### Returns

`void`

***

### credentialsFor()

> **credentialsFor**(`issuer`): [`AuthorizationServerRegistration`](../interfaces/AuthorizationServerRegistration.md) \| `undefined`

Defined in: [protocol/authorization.ts:174](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L174)

Returns the registration state for `issuer`, or `undefined` when none is
stored. Never returns another `issuer`'s credentials. (R-23.1-i, R-23.1-j)

#### Parameters

##### issuer

`string`

#### Returns

[`AuthorizationServerRegistration`](../interfaces/AuthorizationServerRegistration.md) \| `undefined`

***

### hasCredentialsFor()

> **hasCredentialsFor**(`issuer`): `boolean`

Defined in: [protocol/authorization.ts:180](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L180)

Returns `true` when registration state exists for `issuer`.

#### Parameters

##### issuer

`string`

#### Returns

`boolean`

***

### needsReregistration()

> **needsReregistration**(`previousIssuer`, `currentIssuer`): `boolean`

Defined in: [protocol/authorization.ts:198](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization.ts#L198)

Returns `true` when moving from `previousIssuer` to `currentIssuer` requires
the client to re-register / re-discover rather than reuse credentials.

`true` whenever the indicated authorization server changed (the issuers
differ) or no credentials are yet stored for `currentIssuer`. A client MUST
NOT reuse a different server's credentials (R-23.1-k) and MUST re-register or
re-discover against the new one (R-23.1-l).

#### Parameters

##### previousIssuer

`string` \| `undefined`

The previously indicated `issuer`, or `undefined`
  when none was indicated before.

##### currentIssuer

`string`

The `issuer` now indicated by protected-resource
  metadata.

#### Returns

`boolean`
