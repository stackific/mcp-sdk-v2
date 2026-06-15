[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isPathTraversalSafe

# Function: isPathTraversalSafe()

> **isPathTraversalSafe**(`uri`): `boolean`

Defined in: [protocol/roots.ts:303](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L303)

Returns `true` when `uri`, after passing [isValidFileUri](isValidFileUri.md), shows NO
path-traversal artifacts — no `..` path segment and no percent-encoded `..`
(`%2e%2e`). (R-21.1.5-i · SHOULD; AC-32.16)

A client SHOULD validate every root `uri` to guard against path-traversal
before exposing it. This is the SHOULD-level guard layered on top of the
MUST-level `file://` + RFC 3986 check.

The check inspects the RAW input rather than the parsed `URL.pathname`,
because the WHATWG `URL` parser silently resolves (collapses) `..` segments —
so `file:///home/../etc` would parse to `/etc` and hide the artifact. We
therefore scan the raw path portion's segments, decoding each once to catch
percent-encoded dot-dot (`%2e%2e`).

## Parameters

### uri

`unknown`

## Returns

`boolean`
