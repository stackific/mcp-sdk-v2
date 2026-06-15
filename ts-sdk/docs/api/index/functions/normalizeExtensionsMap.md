[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / normalizeExtensionsMap

# Function: normalizeExtensionsMap()

> **normalizeExtensionsMap**(`raw`): [`ExtensionsMap`](../type-aliases/ExtensionsMap.md)

Defined in: [protocol/extensions.ts:210](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L210)

Normalizes a raw, possibly-untrusted `extensions` map into the set of
extensions a receiver should consider ADVERTISED by the peer.

Applies the receiver rules together:
  - a `null` value is malformed → the entry is ignored (the extension is
    treated as not advertised by that peer). (R-6.5-j)
  - a non-object value (array, scalar) is likewise malformed → ignored.
  - a well-formed `{}` is retained — it is an enabling declaration, not
    absence. (R-6.5-h)
  - keys whose identifiers are unknown to the receiver are RETAINED by this
    function (forward compatibility is about not erroring); whether such a key
    becomes active is decided by [intersectExtensions](intersectExtensions.md) against the
    receiver's own advertised set. (R-6.6-d)

Returns a NEW object; the input is not mutated. The result is a clean
`ExtensionsMap` (no `null`/malformed values).

## Parameters

### raw

`unknown`

The peer's advertised `extensions` map (or `undefined` when the
  peer advertised none — equivalent to an empty map).

## Returns

[`ExtensionsMap`](../type-aliases/ExtensionsMap.md)
