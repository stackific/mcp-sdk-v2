[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [client](../README.md) / RequestError

# Class: RequestError

Defined in: client/client.ts:104

A delivered JSON-RPC error response surfaced as a thrown error. Distinct from
[TransportError](../../index/classes/TransportError.md) (a channel failure): this means the request was fully
delivered and the peer answered with an `error`. (§7.5)

## Extends

- `Error`

## Constructors

### Constructor

> **new RequestError**(`code`, `message`, `data?`): `RequestError`

Defined in: client/client.ts:108

#### Parameters

##### code

`number`

##### message

`string`

##### data?

`unknown`

#### Returns

`RequestError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `number`

Defined in: client/client.ts:105

***

### data?

> `readonly` `optional` **data?**: `unknown`

Defined in: client/client.ts:106
