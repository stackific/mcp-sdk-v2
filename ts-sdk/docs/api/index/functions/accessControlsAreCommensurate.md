[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / accessControlsAreCommensurate

# Function: accessControlsAreCommensurate()

> **accessControlsAreCommensurate**(`dataSensitivity`, `appliedControl`): `boolean`

Defined in: [protocol/security.ts:746](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/security.ts#L746)

Returns `true` when the access controls a host applies are at least as strong as
the data's sensitivity requires — user data SHOULD be protected with access
controls commensurate with its sensitivity. (§28.1, §28.4, R-28.1-g, R-28.4-c;
AC-44.4)

Compares the data's sensitivity to the strongest control class the host enforces:
`confidential` data protected only at `internal` strength fails. Use to gate
exposure of sensitive data behind adequate controls.

## Parameters

### dataSensitivity

[`DataSensitivity`](../type-aliases/DataSensitivity.md)

The sensitivity class of the data.

### appliedControl

[`DataSensitivity`](../type-aliases/DataSensitivity.md)

The strongest access-control class the host enforces for it.

## Returns

`boolean`
