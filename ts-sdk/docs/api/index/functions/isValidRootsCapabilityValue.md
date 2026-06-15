[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidRootsCapabilityValue

# Function: isValidRootsCapabilityValue()

> **isValidRootsCapabilityValue**(`value`): `value is Record<string, unknown>`

Defined in: [protocol/roots.ts:145](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/roots.ts#L145)

Returns `true` when `value` is a valid `roots` capability VALUE: any JSON
object (canonically `{}`). (R-21.1.2-a · MUST; AC-32.3)

Non-object values are rejected; unrecognized object members are tolerated
(they do not make the value invalid). (R-21.1.2-b · MUST; AC-32.4)

## Parameters

### value

`unknown`

## Returns

`value is Record<string, unknown>`
