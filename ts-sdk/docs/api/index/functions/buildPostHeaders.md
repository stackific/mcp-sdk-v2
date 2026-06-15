[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / buildPostHeaders

# Function: buildPostHeaders()

> **buildPostHeaders**(`options`): [`HttpHeaders`](../type-aliases/HttpHeaders.md)

Defined in: [transport/http/headers.ts:145](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/http/headers.ts#L145)

Builds the HTTP headers for a client POST: the three required request headers,
the `Mcp-Method` routing header, the conditional `Mcp-Name`, and any
`Mcp-Param-*` headers. (§9.2-f, §9.3, §9.4)

## Parameters

### options

[`BuildPostHeadersOptions`](../interfaces/BuildPostHeadersOptions.md)

## Returns

[`HttpHeaders`](../type-aliases/HttpHeaders.md)
