[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveDisplayName

# Function: resolveDisplayName()

> **resolveDisplayName**(`name`, `title?`, `annotationsTitle?`): `string`

Defined in: [types/base-metadata.ts:41](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/base-metadata.ts#L41)

Resolves the display name to show a human user, applying the spec precedence
rule (§14.1, R-14.1-c, R-14.1-d, R-14.1-e, AC-20.4, AC-20.5, AC-20.6).

 1. Returns `title` when it is a non-empty string.
 2. Returns `annotationsTitle` when provided and non-empty (tool descriptors only).
 3. Falls back to `name`.

## Parameters

### name

`string`

The programmatic identifier (always present).

### title?

`string`

The human display name (optional).

### annotationsTitle?

`string`

Tool-only `annotations.title` (optional; defined in §16 / S24).

## Returns

`string`
