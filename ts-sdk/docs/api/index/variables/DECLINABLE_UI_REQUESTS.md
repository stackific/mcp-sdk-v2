[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DECLINABLE\_UI\_REQUESTS

# Variable: DECLINABLE\_UI\_REQUESTS

> `const` **DECLINABLE\_UI\_REQUESTS**: readonly [`UiDialectMethod`](../type-aliases/UiDialectMethod.md)[]

Defined in: [protocol/ui-host.ts:840](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui-host.ts#L840)

The set of UI-initiated requests that a host, when it declines them (for lack
of consent, policy, or an unknown method), MUST answer with a §22 error rather
than silently dropping. (§26.8, R-26.8-b; AC-42.20)
