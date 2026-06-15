[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / fetchIcon

# Function: fetchIcon()

> **fetchIcon**(`src`, `options?`): `Promise`\<[`FetchIconResult`](../interfaces/FetchIconResult.md)\>

Defined in: [types/icon.ts:251](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L251)

Securely fetches and validates an icon. Edge-friendly: built on Web-platform
`fetch` only (no `node:*`), so it runs on Node, Cloudflare Workers, Deno, and
browsers.

Security rules enforced (§14.2):
 - `src` MUST be `https:` or `data:` (R-14.2-o, via [validateIconSrc](validateIconSrc.md)).
 - Redirects are followed manually; a redirect that changes the scheme or
   moves to a different origin MUST NOT be followed and is rejected
   (R-14.2-p, TV-20.12).
 - The request is credential-free: `credentials: 'omit'` and no `Authorization`
   or `Cookie` header is ever sent (R-14.2-q, TV-20.13).
 - The returned bytes are validated against the allowlist by magic bytes,
   ignoring the declared type (R-14.2-r – R-14.2-u, via [validateIconBytes](validateIconBytes.md)).

## Parameters

### src

`string`

### options?

[`FetchIconOptions`](../interfaces/FetchIconOptions.md) = `{}`

## Returns

`Promise`\<[`FetchIconResult`](../interfaces/FetchIconResult.md)\>

## Throws

On a disallowed scheme, a cross-origin/scheme-change
  redirect, a non-2xx status, too many redirects, or invalid image bytes.
