[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PROTOCOL\_REVISION\_FORMAT\_RE

# Variable: PROTOCOL\_REVISION\_FORMAT\_RE

> `const` **PROTOCOL\_REVISION\_FORMAT\_RE**: `RegExp`

Defined in: [protocol/meta.ts:161](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/meta.ts#L161)

Regular expression for the `YYYY-MM-DD` revision-identifier format. (§5.1)

A conforming revision identifier is exactly 10 characters in the form
`2026-07-28`. The regex validates only the digit/separator layout, not
calendar correctness — implementations MUST treat revision identifiers as
opaque, exactly-matched strings and MUST NOT perform lexical, chronological,
or range comparison. (R-5.1-a, R-5.1-b)

This primitive lives here (S05/meta) rather than in revision.ts (S07) so that
the request gate `validateRequestMeta` can reject a malformed-but-string
`protocolVersion` without importing S07 (which would create a meta↔revision
import cycle). `revision.ts` re-exports it.
