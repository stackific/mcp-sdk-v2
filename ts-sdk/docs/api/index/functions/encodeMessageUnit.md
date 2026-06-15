[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / encodeMessageUnit

# Function: encodeMessageUnit()

> **encodeMessageUnit**(`message`): `Uint8Array`

Defined in: [transport/framing.ts:44](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L44)

Encodes a `JSONRPCMessage` to its UTF-8 JSON bytes, **without** any framing.

`JSON.stringify` escapes any embedded newline inside a string as the two-byte
sequence `\` `n`, so the produced bytes never contain a raw `0x0a` — which is
what makes newline framing unambiguous (R-7.2-d).

## Parameters

### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

## Returns

`Uint8Array`
