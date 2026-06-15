[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / DENY\_BY\_DEFAULT\_CSP

# Variable: DENY\_BY\_DEFAULT\_CSP

> `const` **DENY\_BY\_DEFAULT\_CSP**: `Readonly`\<`Required`\<`Pick`\<[`UiContentSecurityPolicy`](../type-aliases/UiContentSecurityPolicy.md), [`UiCspDirective`](../type-aliases/UiCspDirective.md)\>\>\>

Defined in: [protocol/ui.ts:645](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L645)

The deny-by-default CSP a host MUST apply when a UI resource omits `csp`:
every directive is an empty origin list, so every origin is blocked. (§26.4,
R-26.4-h)
