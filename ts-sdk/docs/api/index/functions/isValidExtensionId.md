[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidExtensionId

# Function: isValidExtensionId()

> **isValidExtensionId**(`identifier`): `boolean`

Defined in: [protocol/extensions.ts:107](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extensions.ts#L107)

Returns `true` when `identifier` is a well-formed extension identifier:
a REQUIRED prefix, a single separating slash, and a (possibly empty) name,
each conforming to the §6.5 grammar. (R-6.5-a, R-6.5-b, R-6.5-e, R-6.5-f)

Note: well-formedness is independent of whether the prefix is reserved — a
reserved identifier such as `io.modelcontextprotocol/tasks` is well-formed;
use [isReservedExtensionPrefix](isReservedExtensionPrefix.md) / [isThirdPartyUsable](isThirdPartyUsable.md) for the
reserved-prefix policy.

## Parameters

### identifier

`string`

## Returns

`boolean`
