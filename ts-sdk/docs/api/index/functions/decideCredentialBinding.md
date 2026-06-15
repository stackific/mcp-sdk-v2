[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideCredentialBinding

# Function: decideCredentialBinding()

> **decideCredentialBinding**(`options`): [`CredentialBindingDecision`](../interfaces/CredentialBindingDecision.md)

Defined in: [protocol/authorization-registration.ts:534](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L534)

Decides whether a client may reuse stored credentials for the
protected-resource-indicated authorization server, must re-register, or should
surface an error. (R-23.16-c, R-23.16-d, R-23.16-e, R-23.16-f, R-23.16-g, CIMD
exemption)

Decision logic, all issuer comparisons by exact string match (R-23.16-f):
  - CIMD credentials are exempt: a portable HTTPS-URL `client_id` has no
    per-issuer state, so `reuse` regardless of issuer (CIMD exemption);
  - no stored credentials, or the stored `issuer` matches the discovered
    `issuer` → `reuse`;
  - stored `issuer` differs from the discovered `issuer`:
      - DCR-obtained (no `cimd`, not flagged pre-registered) → `re-register`
        with the new authorization server (R-23.16-d, R-23.16-e);
      - pre-registered (`isPreRegistered: true`) → `surface-error`, because
        pre-registered credentials cannot be re-registered automatically and the
        client SHOULD surface an error rather than silently using mismatched
        credentials (R-23.16-c, R-23.16-g).

## Parameters

### options

#### stored

[`IssuerBoundCredentials`](../interfaces/IssuerBoundCredentials.md) \| `undefined`

The stored credentials, or `undefined` when none.

#### discoveredIssuer

`string`

#### isPreRegistered?

`boolean`

`true` when the stored credentials were supplied
  out of band rather than obtained via DCR (governs the mismatch action). (R-23.16-g)

## Returns

[`CredentialBindingDecision`](../interfaces/CredentialBindingDecision.md)
