[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / cspAllowsOrigin

# Function: cspAllowsOrigin()

> **cspAllowsOrigin**(`csp`, `directive`, `origin`): `boolean`

Defined in: [protocol/ui.ts:630](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L630)

Returns `true` when `origin` is ALLOWED for the given CSP `directive` of a
`csp` descriptor — it is explicitly listed in that member. An origin not
listed (including when the member is absent) MUST be blocked. (§26.4,
R-26.4-g)

## Parameters

### csp

`objectOutputType`\<\{ `connectDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `resourceDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `frameDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `baseUriDomains`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

The resolved CSP descriptor, or `undefined` when `csp` was
  omitted — in which case deny-by-default applies and this always returns
  `false` (R-26.4-h).

### directive

`"connectDomains"` \| `"resourceDomains"` \| `"frameDomains"` \| `"baseUriDomains"`

Which CSP member to consult.

### origin

`string`

The origin string to test.

## Returns

`boolean`
