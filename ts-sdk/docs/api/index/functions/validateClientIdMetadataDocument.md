[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / validateClientIdMetadataDocument

# Function: validateClientIdMetadataDocument()

> **validateClientIdMetadataDocument**(`documentUrl`, `value`, `presentedRedirectUri?`): [`ClientIdMetadataDocumentValidation`](../type-aliases/ClientIdMetadataDocumentValidation.md)

Defined in: [protocol/authorization-flow.ts:354](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L354)

Validates a fetched CIMD document against the URL it was fetched from — the
fetch/validate duties an authorization server performs on encountering a
URL-formatted `client_id`. (R-23.4-i, R-23.4-j, R-23.4-k)

Checks, in order:
  - the `client_id` URL is a valid HTTPS URL with a path component (R-23.4-e);
  - the body is valid JSON containing the REQUIRED fields (R-23.4-k);
  - the document's `client_id` exactly equals the fetch URL (R-23.4-i);
  - when a `presentedRedirectUri` is supplied, it appears in the document's
    `redirect_uris` (R-23.4-j).

## Parameters

### documentUrl

`string`

The URL the document was fetched from (== `client_id`).

### value

`unknown`

The raw fetched document body.

### presentedRedirectUri?

`string`

OPTIONAL redirect URI from the authorization
  request to validate against `redirect_uris` (R-23.4-j).

## Returns

[`ClientIdMetadataDocumentValidation`](../type-aliases/ClientIdMetadataDocumentValidation.md)
