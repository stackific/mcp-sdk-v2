[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MalformedMessageError

# Class: MalformedMessageError

Defined in: [jsonrpc/framing.ts:162](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L162)

Thrown when a received message is structurally malformed and must be rejected.

Per R-3.4-f, malformed notifications are silently discarded — callers MUST
check the classification result before throwing this error toward the sender.

## Extends

- `Error`

## Constructors

### Constructor

> **new MalformedMessageError**(`reason`): `MalformedMessageError`

Defined in: [jsonrpc/framing.ts:166](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L166)

#### Parameters

##### reason

`string`

#### Returns

`MalformedMessageError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"MALFORMED_MESSAGE"`

Defined in: [jsonrpc/framing.ts:164](https://github.com/stackific/mcp-sdk-node/blob/main/src/jsonrpc/framing.ts#L164)

Stable machine-readable code for programmatic handling.
