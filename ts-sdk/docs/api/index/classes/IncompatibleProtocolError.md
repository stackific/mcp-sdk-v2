[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / IncompatibleProtocolError

# Class: IncompatibleProtocolError

Defined in: [protocol/negotiation.ts:122](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L122)

An actionable error a client surfaces to its caller when no protocol revision
is mutually supported. (R-5.4-d, R-5.5-j) Carries both sides' revision sets
for diagnostics. Distinct from a wire error — it never goes on the wire.

## Extends

- `Error`

## Constructors

### Constructor

> **new IncompatibleProtocolError**(`clientPreference`, `serverSupported`): `IncompatibleProtocolError`

Defined in: [protocol/negotiation.ts:127](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L127)

#### Parameters

##### clientPreference

readonly `string`[]

##### serverSupported

readonly `string`[]

#### Returns

`IncompatibleProtocolError`

#### Overrides

`Error.constructor`

## Properties

### code

> `readonly` **code**: `"INCOMPATIBLE_PROTOCOL"`

Defined in: [protocol/negotiation.ts:123](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L123)

***

### clientPreference

> `readonly` **clientPreference**: readonly `string`[]

Defined in: [protocol/negotiation.ts:124](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L124)

***

### serverSupported

> `readonly` **serverSupported**: readonly `string`[]

Defined in: [protocol/negotiation.ts:125](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/negotiation.ts#L125)
