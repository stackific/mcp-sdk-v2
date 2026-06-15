[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateCustomErrorCode

# Function: validateCustomErrorCode()

> **validateCustomErrorCode**(`code`): \{ `ok`: `true`; `inReservedRange`: `boolean`; \} \| \{ `ok`: `false`; `reason`: `"not-an-integer"` \| `"collides-with-reserved"`; \}

Defined in: [protocol/registries.ts:66](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/registries.ts#L66)

Validates a custom error `code` against Appendix B's collision rule: a custom
code MUST NOT equal any code listed in the Error Code Registry (the five
standard JSON-RPC codes, the two protocol codes, and `-32001` HeaderMismatch).
(R-AppB-a, AC-46.1)

Codes inside the reserved server-error range `-32000..-32099` are permitted
only when they avoid collision with a code this document defines (notably
`-32001`); `-32000..-32099` is the range in which additions are explicitly
allowed. (R-AppB-b, AC-46.2)

Returns `{ ok: true }` when the code is usable, otherwise `{ ok: false }` with
a machine-readable `reason`. Delegates the integer/collision check to
[validateExtensionErrorCode](validateExtensionErrorCode.md) (the §22 helper) so the two stay in lockstep.

## Parameters

### code

`number`

## Returns

\{ `ok`: `true`; `inReservedRange`: `boolean`; \} \| \{ `ok`: `false`; `reason`: `"not-an-integer"` \| `"collides-with-reserved"`; \}
