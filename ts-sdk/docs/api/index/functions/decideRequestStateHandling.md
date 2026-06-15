[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / decideRequestStateHandling

# Function: decideRequestStateHandling()

> **decideRequestStateHandling**(`securitySignificant`, `integrityVerified`): `object`

Defined in: [protocol/conformance-requirements.ts:760](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L760)

Decides how a server must treat a `requestState` value that passed through a
client. (§29.7 item 4, R-29.7-d, R-29.7-e) It is ALWAYS attacker-controlled
input; when it influences authorization, resource access, or business logic
the server MUST verify its integrity and reject what fails.

## Parameters

### securitySignificant

`boolean`

Whether the value influences authz/resource/business logic.

### integrityVerified

`boolean`

Whether the value's integrity check passed.

## Returns

`object`

### trust

> **trust**: `"untrusted"`

### action

> **action**: `"reject"` \| `"accept"`
