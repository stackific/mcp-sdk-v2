[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / unionStepUpScopes

# Function: unionStepUpScopes()

> **unionStepUpScopes**(`alreadyGranted`, `challengedScopes`): `string`[]

Defined in: [protocol/authorization-registration.ts:786](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L786)

Computes the UNION of already-granted/already-requested scopes with the
newly-challenged scopes, the scope set a step-up re-authorization requests.
(R-23.18-o, R-23.18-p, R-23.1-ae)

Order-preserving and deduplicating: every already-granted scope is retained
(R-23.18-p — never dropped) and the challenged scopes are appended. The result
is the authoritative requested-scope set for the re-authorization. Hierarchically
redundant scopes are NOT deduplicated semantically — the AS normalizes that
during issuance (R-23.18-r).

## Parameters

### alreadyGranted

readonly `string`[]

The scopes the client already holds/requested.

### challengedScopes

readonly `string`[]

The scopes from the current challenge.

## Returns

`string`[]
