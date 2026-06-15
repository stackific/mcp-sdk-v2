[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / UiContentSecurityPolicySchema

# Variable: UiContentSecurityPolicySchema

> `const` **UiContentSecurityPolicySchema**: `ZodObject`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `"passthrough"`, `ZodTypeAny`, `objectOutputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>, `objectInputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\>\>

Defined in: [protocol/ui.ts:592](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L592)

`UiContentSecurityPolicy` — a content-security-policy descriptor carried in a
UI resource's `_meta.ui.csp`. Each member is an array of origin strings; an
origin NOT listed in the applicable member MUST be blocked by the host.
(§26.4, R-26.4-f, R-26.4-g)

All members are OPTIONAL. When `csp` itself is omitted, the host MUST apply a
restrictive deny-by-default policy (R-26.4-h) — see [resolveCsp](../functions/resolveCsp.md).
`.passthrough()` preserves forward-compatible CSP members.
