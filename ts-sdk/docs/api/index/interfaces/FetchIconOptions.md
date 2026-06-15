[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FetchIconOptions

# Interface: FetchIconOptions

Defined in: [types/icon.ts:204](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L204)

Options for [fetchIcon](../functions/fetchIcon.md).

## Properties

### fetch?

> `optional` **fetch?**: (`input`, `init?`) => `Promise`\<`Response`\>

Defined in: [types/icon.ts:206](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L206)

Override the `fetch` implementation (injection point for tests / non-global runtimes).

#### Parameters

##### input

`string` \| `URL` \| `Request`

##### init?

`RequestInit`

#### Returns

`Promise`\<`Response`\>

***

### allowedTypes?

> `optional` **allowedTypes?**: `ReadonlySet`\<`string`\>

Defined in: [types/icon.ts:208](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L208)

Allowed rendered MIME types; defaults to [DEFAULT\_IMAGE\_ALLOWLIST](../variables/DEFAULT_IMAGE_ALLOWLIST.md).

***

### maxRedirects?

> `optional` **maxRedirects?**: `number`

Defined in: [types/icon.ts:210](https://github.com/stackific/mcp-sdk-node/blob/main/src/types/icon.ts#L210)

Maximum number of same-origin redirects to follow before giving up. Default 5.
