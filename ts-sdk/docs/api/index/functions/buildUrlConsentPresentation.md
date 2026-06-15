[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildUrlConsentPresentation

# Function: buildUrlConsentPresentation()

> **buildUrlConsentPresentation**(`url`): [`UrlConsentPresentation`](../interfaces/UrlConsentPresentation.md)

Defined in: [protocol/elicitation-form.ts:1335](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/elicitation-form.ts#L1335)

Builds the consent-presentation data a client MUST show before opening a
URL-mode elicitation URL: the full URL and a clearly-highlighted target host,
plus warnings about Punycode / ambiguous URIs. (§20.7, R-20.7-v, R-20.7-x)

This produces the data a UI binds to; it does NOT open the URL or prefetch it
(a client MUST NOT prefetch — R-20.7-t — and MUST NOT open without consent —
R-20.7-u). The host is exposed separately so the UI can highlight it to defend
against subdomain spoofing, and a Punycode host raises a warning.

## Parameters

### url

`string`

## Returns

[`UrlConsentPresentation`](../interfaces/UrlConsentPresentation.md)

## Throws

When `url` is not a valid absolute URL.
