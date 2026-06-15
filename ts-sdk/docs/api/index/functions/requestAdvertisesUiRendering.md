[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requestAdvertisesUiRendering

# Function: requestAdvertisesUiRendering()

> **requestAdvertisesUiRendering**(`requestMeta`): `boolean`

Defined in: [protocol/ui.ts:305](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/ui.ts#L305)

Reads the host's advertised `extensions` map from a single request's `_meta`
(the map nested under `io.modelcontextprotocol/clientCapabilities.extensions`)
and reports whether it advertises UI rendering with the required MIME type.
(§26.2, R-26.2-c)

A host that supports rendering UIs MUST advertise the extension in the
`_meta` of EVERY request (R-26.2-c); the stateless model means each request is
judged on its own `_meta`. A request whose `_meta` omits the advertisement —
or omits `clientCapabilities` entirely — yields `false`, and the server
treats that request as if the extension were inactive (R-26.2-i).

## Parameters

### requestMeta

`unknown`

The request's `_meta` object (raw).

## Returns

`boolean`
