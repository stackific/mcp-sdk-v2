[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / RootsCapabilitySchema

# ~~Variable: RootsCapabilitySchema~~

> `const` **RootsCapabilitySchema**: `ZodRecord`\<`ZodString`, `ZodUnknown`\>

Defined in: [protocol/roots.ts:134](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L134)

The value of the `roots` key in the client-capabilities object. (§21.1.2,
R-21.1.2-a · MUST)

⚠️ DEPRECATED. An object with NO defined members in this revision; the empty
object `{}` is the canonical value. Presence of the key (with any object
value) signals support for roots-listing; absence signals no support.
`.passthrough()` keeps unrecognized members so a receiver IGNORES rather than
rejects them. (R-21.1.2-b · MUST) No `listChanged` sub-flag is defined; this
schema deliberately declares none. (R-21.1.2-c · MUST NOT)

A value that is NOT a JSON object (e.g. `true`, `[]`, `"x"`) is invalid.
(AC-32.3)

## Deprecated

Roots is a Deprecated client capability (§27.3). No direct
replacement; roots integration is now host-managed. Earliest removal:
2026-07-28 (§27.2/§27.3, R-27.4-a/-b).
