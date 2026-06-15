[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / discoverOAuthMetadata

# Function: discoverOAuthMetadata()

> **discoverOAuthMetadata**(`options`): `Promise`\<[`DiscoveredOAuthMetadata`](../interfaces/DiscoveredOAuthMetadata.md)\>

Defined in: client/oauth.ts:65

Discovers protected-resource metadata (RFC 9728) then authorization-server
metadata (RFC 8414). (§23.2–§23.3)

## Parameters

### options

#### resource

`string`

#### resourceMetadataUrl?

`string`

#### fetch?

(`input`, `init?`) => `Promise`\<`Response`\>

## Returns

`Promise`\<[`DiscoveredOAuthMetadata`](../interfaces/DiscoveredOAuthMetadata.md)\>
