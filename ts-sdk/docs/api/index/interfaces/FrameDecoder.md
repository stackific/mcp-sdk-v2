[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / FrameDecoder

# Interface: FrameDecoder

Defined in: [transport/framing.ts:129](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L129)

Splits a byte stream back into the byte boundaries of individual messages,
using framing alone — the decoder MUST NOT parse the JSON body to find where
one message ends and the next begins. (R-7.2-b, R-7.2-c, R-7.2-d)

A decoder is stateful: it buffers bytes that do not yet form a complete unit
and emits each complete unit as soon as its delimiter arrives.

## Properties

### pending

> `readonly` **pending**: `number`

Defined in: [transport/framing.ts:136](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L136)

Number of buffered bytes not yet forming a complete unit (never dropped).

## Methods

### push()

> **push**(`chunk`): `Uint8Array`\<`ArrayBufferLike`\>[]

Defined in: [transport/framing.ts:134](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L134)

Feeds a chunk of received bytes and returns every complete message unit now
available (framing removed). Incomplete trailing bytes are retained.

#### Parameters

##### chunk

`Uint8Array`

#### Returns

`Uint8Array`\<`ArrayBufferLike`\>[]

***

### remainder()

> **remainder**(): `Uint8Array`

Defined in: [transport/framing.ts:138](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L138)

A copy of the buffered, not-yet-complete bytes.

#### Returns

`Uint8Array`
