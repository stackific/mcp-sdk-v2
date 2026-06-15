[**@stackific/mcp-sdk-ts**](../../README.md)

***

[@stackific/mcp-sdk-ts](../../README.md) / [index](../README.md) / isValidThirdPartyExtensionId

# Function: isValidThirdPartyExtensionId()

> **isValidThirdPartyExtensionId**(`identifier`): `boolean`

Defined in: [protocol/extension-mechanism.ts:168](https://github.com/stackific/mcp-sdk-node/blob/main/src/protocol/extension-mechanism.ts#L168)

Returns `true` when a THIRD PARTY may define an extension under `identifier`:
well-formed, not under a reserved second-label prefix, and not using a bare
reserved vendor token. (R-24.2-a, R-24.2-b, R-24.2-d, R-24.2-e, R-24.2-f)

Unlike S11's `isThirdPartyUsable`, this additionally rejects the bare tokens
`modelcontextprotocol`/`mcp` as single-label prefixes (R-24.2-f), which the
second-label rule alone does not catch.

## Parameters

### identifier

`string`

## Returns

`boolean`
