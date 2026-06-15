[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / issuersMatchExactly

# Function: issuersMatchExactly()

> **issuersMatchExactly**(`a`, `b`): `boolean`

Defined in: [protocol/authorization-registration.ts:505](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/authorization-registration.ts#L505)

Compares two `issuer` identifiers by EXACT string match, the comparison
mandated for credential binding. No scheme/host case folding, default-port
elision, trailing-slash, or percent-encoding normalization is applied.
(R-23.16-f)

## Parameters

### a

`string`

One `issuer` identifier.

### b

`string`

The other `issuer` identifier.

## Returns

`boolean`
