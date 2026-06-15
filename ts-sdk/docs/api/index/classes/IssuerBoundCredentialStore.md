[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IssuerBoundCredentialStore

# Class: IssuerBoundCredentialStore

Defined in: [protocol/authorization-registration.ts:578](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L578)

An issuer-keyed store for persisted, issuer-bound client credentials, keeping
separate registration state per authorization server. (R-23.16-a, R-23.16-b,
R-23.17-d)

The storage key is the authorization server's `issuer` identifier (R-23.16-b);
[credentialsFor](#credentialsfor) never returns another issuer's credentials, so a caller
cannot reuse credentials across authorization servers (R-23.16-c). Distinct from
S36's `DynamicClientRegistrationStore` (DCR-specific) and S35's `CredentialStore`
(runtime tokens): this holds the persisted registration identity for ALL
mechanisms (pre-registration and DCR), flagged with the CIMD exemption.

## Constructors

### Constructor

> **new IssuerBoundCredentialStore**(): `IssuerBoundCredentialStore`

#### Returns

`IssuerBoundCredentialStore`

## Methods

### save()

> **save**(`credentials`): `void`

Defined in: [protocol/authorization-registration.ts:586](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L586)

Persists `credentials`, keyed by their `issuer`. (R-23.16-a, R-23.16-b)

#### Parameters

##### credentials

[`IssuerBoundCredentials`](../interfaces/IssuerBoundCredentials.md)

#### Returns

`void`

#### Throws

When `credentials.issuer` is empty — the key is REQUIRED.

***

### credentialsFor()

> **credentialsFor**(`issuer`): [`IssuerBoundCredentials`](../interfaces/IssuerBoundCredentials.md) \| `undefined`

Defined in: [protocol/authorization-registration.ts:594](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L594)

Returns the credentials stored for `issuer`, or `undefined`. Never another issuer's. (R-23.16-b, R-23.16-c)

#### Parameters

##### issuer

`string`

#### Returns

[`IssuerBoundCredentials`](../interfaces/IssuerBoundCredentials.md) \| `undefined`

***

### has()

> **has**(`issuer`): `boolean`

Defined in: [protocol/authorization-registration.ts:600](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L600)

Returns `true` when credentials are stored for `issuer`.

#### Parameters

##### issuer

`string`

#### Returns

`boolean`

***

### decideFor()

> **decideFor**(`discoveredIssuer`, `isPreRegistered?`): [`CredentialBindingDecision`](../interfaces/CredentialBindingDecision.md)

Defined in: [protocol/authorization-registration.ts:612](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L612)

Returns the [CredentialBindingDecision](../interfaces/CredentialBindingDecision.md) for the credentials stored under
`discoveredIssuer`, the convenience entry point combining lookup and
[decideCredentialBinding](../functions/decideCredentialBinding.md). (R-23.16-c – R-23.16-g)

#### Parameters

##### discoveredIssuer

`string`

The `issuer` indicated by the target server's metadata.

##### isPreRegistered?

`boolean` = `false`

`true` when the stored credentials were pre-registered.

#### Returns

[`CredentialBindingDecision`](../interfaces/CredentialBindingDecision.md)
