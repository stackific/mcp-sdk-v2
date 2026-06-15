[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_DIALECT\_PROTOCOL\_VERSION

# Variable: UI\_DIALECT\_PROTOCOL\_VERSION

> `const` **UI\_DIALECT\_PROTOCOL\_VERSION**: `"2026-01-26"`

Defined in: [protocol/ui-host.ts:90](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L90)

The exact, case-sensitive protocol-version string carried in this dialect's
initialization handshake. It identifies the *message-dialect* revision and is
INDEPENDENT of the core protocol revision negotiated at `server/discover`
(§5). (§26.5, R-26.5-b)

This is deliberately a distinct constant from any core-revision string: the
two revisions evolve separately, and conflating them is a conformance error.
