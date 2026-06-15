[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / requestCarriesMetaEnvelope

# Function: requestCarriesMetaEnvelope()

> **requestCarriesMetaEnvelope**(`request`): `boolean`

Defined in: [transport/contract.ts:183](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L183)

Returns `true` when a request carries the inline `_meta` envelope with the
three reserved `io.modelcontextprotocol/*` keys. (R-7.4-d, R-7.4-f)

The inline envelope is REQUIRED regardless of transport; the message body is
the source of truth. A transport MAY additionally mirror these fields into
transport-level metadata (see [extractEnvelopeForMirroring](extractEnvelopeForMirroring.md)), but that
mirror is never a substitute for the inline envelope.

## Parameters

### request

`unknown`

## Returns

`boolean`
