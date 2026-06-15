[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MessageFramer

# Interface: MessageFramer

Defined in: [transport/framing.ts:145](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L145)

Encodes messages to delimited byte units and produces decoders that recover
them. A `MessageFramer` is the §7.2 framing guarantee made concrete.

## Properties

### name

> `readonly` **name**: `string`

Defined in: [transport/framing.ts:147](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L147)

A short identifier for the framing (useful when documenting a transport).

## Methods

### encode()

> **encode**(`message`): `Uint8Array`

Defined in: [transport/framing.ts:149](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L149)

Encodes a message to one self-delimited byte unit.

#### Parameters

##### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

#### Returns

`Uint8Array`

***

### createDecoder()

> **createDecoder**(): [`FrameDecoder`](FrameDecoder.md)

Defined in: [transport/framing.ts:151](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L151)

Creates a fresh stateful decoder for one inbound byte stream.

#### Returns

[`FrameDecoder`](FrameDecoder.md)
