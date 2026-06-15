[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UI\_RESPONSIBILITY\_OWNER

# Variable: UI\_RESPONSIBILITY\_OWNER

> `const` **UI\_RESPONSIBILITY\_OWNER**: `Readonly`\<`Record`\<[`UiResponsibility`](../type-aliases/UiResponsibility.md), [`UiRole`](../type-aliases/UiRole.md)\>\>

Defined in: [protocol/ui.ts:159](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L159)

The fixed, normative assignment of each [UiResponsibility](../type-aliases/UiResponsibility.md) to the role
that owns it. (§26.1, R-26.1-b, R-26.1-c, R-26.1-d, R-26.1-e, R-26.1-f,
R-26.1-g, R-26.1-h)

The server (and server-side SDK) is RESPONSIBLE only for declaring the
association and serving the resource; everything to do with rendering,
isolation, policy enforcement, the channel, and consent is the host's. A
server SDK is explicitly NOT responsible for rendering, sandboxing, or the
channel (R-26.1-d) — those rows map to `'host'`.
