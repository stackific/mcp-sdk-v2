[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / resolveCsp

# Function: resolveCsp()

> **resolveCsp**(`csp`): `objectOutputType`

Defined in: [protocol/ui.ts:665](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L665)

Resolves the CSP a host applies for a UI resource: the declared `csp` when
present, otherwise the restrictive [DENY\_BY\_DEFAULT\_CSP](../variables/DENY_BY_DEFAULT_CSP.md) (deny-by-default).
(§26.4, R-26.4-h)

The host MUST apply a restrictive policy CONSTRAINED by the declared
descriptor — i.e. it never grants an origin the descriptor did not list — so a
present `csp` is returned as-is for the host to constrain its policy by
(R-26.4-o). An absent `csp` yields the all-empty deny-by-default policy.

## Parameters

### csp

`objectOutputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The UI resource's declared `csp`, or `undefined`.

## Returns

`objectOutputType`
