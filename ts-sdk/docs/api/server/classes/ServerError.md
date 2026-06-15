[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [server](../README.md) / ServerError

# Class: ServerError

Defined in: server/server.ts:35

A JSON-RPC protocol error a handler may throw; it becomes a wire `error`
object. Distinct from a tool error (a successful result with `isError: true`).

## Extends

- `Error`

## Constructors

### Constructor

> **new ServerError**(`code`, `message`, `data?`): `ServerError`

Defined in: server/server.ts:36

#### Parameters

##### code

`number`

##### message

`string`

##### data?

`unknown`

#### Returns

`ServerError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `number`

Defined in: server/server.ts:37

***

### data?

> `readonly` `optional` **data?**: `unknown`

Defined in: server/server.ts:39
