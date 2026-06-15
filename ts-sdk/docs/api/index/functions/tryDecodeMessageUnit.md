[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / tryDecodeMessageUnit

# Function: tryDecodeMessageUnit()

> **tryDecodeMessageUnit**(`bytes`): [`DecodeResult`](../type-aliases/DecodeResult.md)

Defined in: [transport/framing.ts:108](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L108)

Non-throwing variant of [decodeMessageUnit](decodeMessageUnit.md): returns an `ok: false`
result carrying the `TransportError` instead of throwing. The failure is
still observable (it is returned, not swallowed) so the no-silent-drop rule
(R-7.6-c) holds.

## Parameters

### bytes

`Uint8Array`

## Returns

[`DecodeResult`](../type-aliases/DecodeResult.md)
