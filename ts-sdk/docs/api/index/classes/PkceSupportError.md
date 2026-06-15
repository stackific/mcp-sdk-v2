[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / PkceSupportError

# Class: PkceSupportError

Defined in: [protocol/authorization-flow.ts:786](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L786)

Thrown when a client refuses to proceed because PKCE `S256` support cannot be
confirmed from authorization-server metadata. (§28.5, R-28.5-k)

## Extends

- `Error`

## Constructors

### Constructor

> **new PkceSupportError**(`message`): `PkceSupportError`

Defined in: [protocol/authorization-flow.ts:788](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L788)

#### Parameters

##### message

`string`

#### Returns

`PkceSupportError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"PKCE_SUPPORT_UNCONFIRMED"`

Defined in: [protocol/authorization-flow.ts:787](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-flow.ts#L787)
