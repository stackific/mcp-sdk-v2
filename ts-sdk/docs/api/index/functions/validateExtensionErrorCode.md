[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateExtensionErrorCode

# Function: validateExtensionErrorCode()

> **validateExtensionErrorCode**(`code`): \{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-integer"` \| `"collides-with-reserved"`; \}

Defined in: [protocol/errors.ts:289](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/errors.ts#L289)

Validates that `code` is a legal extension-defined error code: an integer
that does not collide with any reserved code. (R-22.7-a, R-22.7-b, R-22.7-c)

Returns `{ ok: true }` when usable; otherwise `{ ok: false, reason }`
explaining the violation. Extensions SHOULD additionally carry structured
`data` (R-22.7-d) — that is a payload concern, not enforced here.

## Parameters

### code

`number`

## Returns

\{ `ok`: `true`; \} \| \{ `ok`: `false`; `reason`: `"not-an-integer"` \| `"collides-with-reserved"`; \}
