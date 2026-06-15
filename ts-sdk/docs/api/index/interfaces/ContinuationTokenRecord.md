[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / ContinuationTokenRecord

# Interface: ContinuationTokenRecord\<S\>

Defined in: [protocol/security.ts:936](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L936)

A server-side handle to continuation state, the §28.6 handling profile for the
S17 `requestState` token. (§28.6, R-28.6-a, R-28.6-c) The token a client receives
is the opaque `value`; the integrity and binding are server-held so the client
cannot read, forge, or tamper with the state it represents.

## Type Parameters

### S

`S` = `unknown`

## Properties

### value

> **value**: `string`

Defined in: [protocol/security.ts:938](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L938)

The opaque token value handed to the client.

***

### integrityTag

> **integrityTag**: `string`

Defined in: [protocol/security.ts:944](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L944)

The integrity tag the server uses to detect tampering — a signature/MAC over the
state, or (for an unguessable-handle design) the handle's existence in this
store. A receiver MUST reject a token whose presented tag fails this. (R-28.6-a)

***

### state

> **state**: `S`

Defined in: [protocol/security.ts:946](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L946)

The server-held continuation state the token stands for.

***

### expiresAtMs?

> `optional` **expiresAtMs?**: `number`

Defined in: [protocol/security.ts:948](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L948)

Epoch ms after which the token is expired and replay is refused; `undefined` ⇒ no time bound. (R-28.6-c)

***

### consumed?

> `optional` **consumed?**: `boolean`

Defined in: [protocol/security.ts:950](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L950)

`true` once the token has been consumed, for single-use replay defense. (R-28.6-c)
