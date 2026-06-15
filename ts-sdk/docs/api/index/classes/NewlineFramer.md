[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / NewlineFramer

# Class: NewlineFramer

Defined in: [transport/framing.ts:212](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L212)

Newline-delimited JSON-RPC framing over a byte stream. (§7.2, §7.3, §8 framing)

Each message is its UTF-8 JSON serialization followed by a single `\n`. A
receiver recovers messages by splitting on `\n` without parsing the body
(R-7.2-c, R-7.2-d). This is the framing a custom transport over a reliable
bidirectional byte stream (Unix socket, TCP) SHOULD reuse rather than
defining a new one (R-7.3-e); the stdio transport (S13) is this framing plus
process-lifecycle rules.

## Implements

- [`MessageFramer`](../interfaces/MessageFramer.md)

## Constructors

### Constructor

> **new NewlineFramer**(): `NewlineFramer`

#### Returns

`NewlineFramer`

## Properties

### name

> `readonly` **name**: `"newline"` = `'newline'`

Defined in: [transport/framing.ts:213](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L213)

A short identifier for the framing (useful when documenting a transport).

#### Implementation of

[`MessageFramer`](../interfaces/MessageFramer.md).[`name`](../interfaces/MessageFramer.md#name)

## Methods

### encode()

> **encode**(`message`): `Uint8Array`

Defined in: [transport/framing.ts:215](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L215)

Encodes a message to one self-delimited byte unit.

#### Parameters

##### message

[`JSONRPCMessage`](../type-aliases/JSONRPCMessage.md)

#### Returns

`Uint8Array`

#### Implementation of

[`MessageFramer`](../interfaces/MessageFramer.md).[`encode`](../interfaces/MessageFramer.md#encode)

***

### createDecoder()

> **createDecoder**(): [`FrameDecoder`](../interfaces/FrameDecoder.md)

Defined in: [transport/framing.ts:220](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/framing.ts#L220)

Creates a fresh stateful decoder for one inbound byte stream.

#### Returns

[`FrameDecoder`](../interfaces/FrameDecoder.md)

#### Implementation of

[`MessageFramer`](../interfaces/MessageFramer.md).[`createDecoder`](../interfaces/MessageFramer.md#createdecoder)
