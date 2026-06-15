[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / satisfiesRole

# Function: satisfiesRole()

> **satisfiesRole**(`satisfiedRoles`, `targetRole`): `boolean`

Defined in: [protocol/conformance-requirements.ts:972](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/conformance-requirements.ts#L972)

Returns `true` when an implementation satisfying ONLY one role's requirements
is conformant for `targetRole`. (§29.1, R-29.1-a, R-29.1-b) A both-roles
implementation must satisfy each role; satisfying only the other role's
requirements is non-conformant for `targetRole`.

## Parameters

### satisfiedRoles

`Iterable`\<[`ConformanceRole`](../type-aliases/ConformanceRole.md)\>

The roles whose requirements the implementation provably satisfies.

### targetRole

[`ConformanceRole`](../type-aliases/ConformanceRole.md)

The role whose conformance is being judged.

## Returns

`boolean`
