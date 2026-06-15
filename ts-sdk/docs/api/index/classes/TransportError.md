[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / TransportError

# Class: TransportError

Defined in: [transport/contract.ts:44](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L44)

A failure of the transport channel itself — distinct from a JSON-RPC error
response. (§7.5)

A JSON-RPC error response (an `error` object inside a delivered message) is a
normal, fully delivered protocol message reporting that a request failed at
the protocol/application layer. A `TransportError` instead signals that the
channel could not carry a message, that a received unit was malformed at the
encoding/framing level, or that the connection was lost — i.e. an observable
transport-level failure (R-7.2-q, R-7.2-r, R-7.5-i, R-7.5-j, R-7.6-b).

## Extends

- `Error`

## Constructors

### Constructor

> **new TransportError**(`message`, `options?`): `TransportError`

Defined in: [transport/contract.ts:48](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L48)

#### Parameters

##### message

`string`

##### options?

###### cause?

`unknown`

#### Returns

`TransportError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"TRANSPORT_ERROR"`

Defined in: [transport/contract.ts:46](https://github.com/stackific/mcp-sdk-node/blob/main/src/transport/contract.ts#L46)

Stable machine-readable code for programmatic handling.
