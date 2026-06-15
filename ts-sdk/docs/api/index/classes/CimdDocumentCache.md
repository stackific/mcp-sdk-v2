[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / CimdDocumentCache

# Class: CimdDocumentCache

Defined in: [protocol/authorization-registration.ts:287](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L287)

An authorization-server-side cache for fetched CIMD documents that respects HTTP
cache headers and applies a host-domain trust policy. (R-23.12-k, R-23.12-l)

The AS SHOULD cache documents (R-23.12-k) and SHOULD apply CIMD security
considerations such as a trust policy over allowed client-hosting domains
(R-23.12-l). This cache enforces both: an optional `trustHost` predicate
rejects documents hosted on disallowed domains before they are stored, and a
`Cache-Control: no-store`/`no-cache` directive (or a non-positive `max-age`)
keeps a document out of the cache.

## Constructors

### Constructor

> **new CimdDocumentCache**(`options?`): `CimdDocumentCache`

Defined in: [protocol/authorization-registration.ts:299](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L299)

#### Parameters

##### options?

###### trustHost?

(`host`) => `boolean`

OPTIONAL host-domain trust policy; a document whose
  `client_id` host fails this predicate is never cached or returned (R-23.12-l).
  Defaults to trusting all hosts.

###### now?

() => `number`

OPTIONAL clock (epoch ms) for testing; defaults to
  `Date.now`.

#### Returns

`CimdDocumentCache`

## Methods

### isHostTrusted()

> **isHostTrusted**(`clientIdUrl`): `boolean`

Defined in: [protocol/authorization-registration.ts:310](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L310)

Returns `true` when the host of `clientIdUrl` is permitted by the trust policy.
(R-23.12-l)

#### Parameters

##### clientIdUrl

`string`

The CIMD `client_id` URL.

#### Returns

`boolean`

***

### store()

> **store**(`clientIdUrl`, `document`, `cacheControl?`): `boolean`

Defined in: [protocol/authorization-registration.ts:330](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L330)

Caches a fetched CIMD document keyed by its `client_id` URL, honouring HTTP
cache directives and the trust policy. Returns `true` when the document was
stored, `false` when caching was declined (untrusted host, `no-store`, or a
non-positive `max-age`). (R-23.12-k, R-23.12-l)

#### Parameters

##### clientIdUrl

`string`

The `client_id` URL the document was fetched from.

##### document

`objectOutputType`

The fetched document.

##### cacheControl?

[`CimdCacheControl`](../interfaces/CimdCacheControl.md) = `{}`

The response's HTTP cache directives, if any.

#### Returns

`boolean`

***

### get()

> **get**(`clientIdUrl`): `objectOutputType`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`

Defined in: [protocol/authorization-registration.ts:348](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L348)

Returns the cached document for `clientIdUrl` when present, trusted, and still
fresh; otherwise `undefined`. A stale entry is evicted on access. (R-23.12-k)

#### Parameters

##### clientIdUrl

`string`

The `client_id` URL.

#### Returns

`objectOutputType`\<\{ `client_id`: `ZodString`; `client_name`: `ZodString`; `redirect_uris`: `ZodArray`\<`ZodString`, `"many"`\>; `client_uri`: `ZodOptional`\<`ZodString`\>; `logo_uri`: `ZodOptional`\<`ZodString`\>; `grant_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `response_types`: `ZodOptional`\<`ZodArray`\<`ZodString`, `"many"`\>\>; `token_endpoint_auth_method`: `ZodOptional`\<`ZodString`\>; \}, `ZodTypeAny`, `"passthrough"`\> \| `undefined`
