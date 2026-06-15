[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CimdCacheControl

# Interface: CimdCacheControl

Defined in: [protocol/authorization-registration.ts:269](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L269)

The HTTP caching directives an authorization server honours when caching a
fetched CIMD document. (R-23.12-k)

## Properties

### maxAgeSeconds?

> `optional` **maxAgeSeconds?**: `number`

Defined in: [protocol/authorization-registration.ts:271](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L271)

`max-age` in seconds from `Cache-Control`, if any.

***

### noStore?

> `optional` **noStore?**: `boolean`

Defined in: [protocol/authorization-registration.ts:273](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L273)

`true` when `Cache-Control: no-store` (or `no-cache`) forbids caching.
