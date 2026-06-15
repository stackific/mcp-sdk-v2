[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / MissingCapabilityError

# Class: MissingCapabilityError

Defined in: [protocol/capabilities.ts:26](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L26)

Error thrown when a server receives a request that requires a capability the
client did not declare for that request. (R-2.2.2-c, AC-01.15)

The concrete numeric error code is defined in S09. This class uses a symbolic
string code as a stable programmatic identifier until S09 is implemented.

## Extends

- `Error`

## Constructors

### Constructor

> **new MissingCapabilityError**(`capability`): `MissingCapabilityError`

Defined in: [protocol/capabilities.ts:33](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L33)

#### Parameters

##### capability

`string`

#### Returns

`MissingCapabilityError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"MISSING_CAPABILITY"`

Defined in: [protocol/capabilities.ts:28](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L28)

Symbolic code; numeric wire value assigned in S09.

***

### capability

> `readonly` **capability**: `string`

Defined in: [protocol/capabilities.ts:31](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/capabilities.ts#L31)

The name of the capability that was required but not declared.
